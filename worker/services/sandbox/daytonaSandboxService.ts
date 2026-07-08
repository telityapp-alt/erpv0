import { Daytona, type Sandbox } from '@daytona/sdk';
import {
	BootstrapResponse,
	BootstrapStatusResponse,
	ClearErrorsResponse,
	DeploymentResult,
	ExecuteCommandsResponse,
	GetFilesResponse,
	GetInstanceResponse,
	GetLogsResponse,
	InstanceCreationRequest,
	ListInstancesResponse,
	RuntimeError,
	RuntimeErrorResponse,
	ShutdownResponse,
	StaticAnalysisResponse,
	type CodeIssue,
	type GetFilesResponse as GetFilesResponseType,
	type InstanceDetails,
	type TemplateFile,
	type WriteFilesRequest,
	type WriteFilesResponse,
} from './sandboxTypes';
import { BaseSandboxService } from './BaseSandboxService';
import { createObjectLogger } from '../../logger';
import { env } from 'cloudflare:workers';
import { DeploymentTarget } from 'worker/agents/core/types';

const MANAGED_BY_LABEL = 'managed-by';
const MANAGED_BY_VALUE = 'vibesdk';
const SESSION_LABEL = 'vibesdk-session-id';
const PROJECT_LABEL = 'vibesdk-project';
const PREVIEW_PORT_CANDIDATES = [5173, 3000, 4173, 8080, 8000, 8787];
const DEFAULT_PREVIEW_TTL_SECONDS = 60 * 60 * 24;
const DEFAULT_AUTO_STOP_MINUTES = 30;
const DEFAULT_AUTO_DELETE_MINUTES = 24 * 60;
const PREVIEW_BOOT_TIMEOUT_MS = 90_000;
const PREVIEW_POLL_INTERVAL_MS = 3_000;

interface DaytonaInstanceMetadata {
	projectName: string;
	startTime: string;
	workspacePath: string;
	sessionId: string;
	commandId: string;
	previewPort?: number;
	previewURL?: string;
	tunnelURL?: string;
	donttouchFiles: string[];
	redactedFiles: string[];
}

interface DaytonaPreviewState {
	port: number;
	previewURL: string;
}

interface DaytonaSessionCommand {
	exitCode?: number | null;
}

export class DaytonaSandboxServiceClient extends BaseSandboxService {
	private static daytona: Daytona | null = null;
	private metadataCache = new Map<string, DaytonaInstanceMetadata>();
	private sandboxCache = new Map<string, Sandbox>();

	constructor(sandboxId: string) {
		super(sandboxId);
		this.logger = createObjectLogger(this, 'DaytonaSandboxServiceClient');
		this.logger.info('Daytona sandbox service client initialized', { sandboxId: this.sandboxId });
	}

	private getClient(): Daytona {
		if (!DaytonaSandboxServiceClient.daytona) {
			DaytonaSandboxServiceClient.daytona = new Daytona({
				apiKey: env.DAYTONA_API_KEY,
				apiUrl: env.DAYTONA_API_URL || undefined,
				target: env.DAYTONA_TARGET || undefined,
			});
		}

		return DaytonaSandboxServiceClient.daytona;
	}

	private getMetadataKey(instanceId: string): string {
		return `daytona-instance:${instanceId}`;
	}

	private sanitizeName(value: string): string {
		const compact = value
			.toLowerCase()
			.replace(/[^a-z0-9-]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 48);

		return compact || `sandbox-${this.sandboxId.slice(0, 8)}`;
	}

	private toAbsoluteSandboxPath(workspacePath: string, filePath: string): string {
		const normalizedWorkspace = workspacePath.replace(/\\/g, '/').replace(/\/+$/g, '');
		const normalizedFilePath = filePath.replace(/\\/g, '/').replace(/^\/+/g, '');
		return `${normalizedWorkspace}/${normalizedFilePath}`;
	}

	private parentDirectory(filePath: string): string | null {
		const normalized = filePath.replace(/\\/g, '/');
		const lastSlash = normalized.lastIndexOf('/');
		if (lastSlash <= 0) {
			return null;
		}

		return normalized.slice(0, lastSlash);
	}

	private getTimeoutSeconds(timeout?: number): number | undefined {
		if (!timeout || Number.isNaN(timeout)) {
			return undefined;
		}

		return timeout > 1000 ? Math.ceil(timeout / 1000) : timeout;
	}

	private async sleep(ms: number): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, ms));
	}

	private async getSandbox(instanceId: string): Promise<Sandbox> {
		const cached = this.sandboxCache.get(instanceId);
		if (cached) {
			return cached;
		}

		const sandbox = await this.getClient().get(instanceId);
		this.sandboxCache.set(instanceId, sandbox);
		return sandbox;
	}

	private async readMetadata(instanceId: string): Promise<DaytonaInstanceMetadata | null> {
		const cached = this.metadataCache.get(instanceId);
		if (cached) {
			return cached;
		}

		const stored = await env.VibecoderStore.get(this.getMetadataKey(instanceId));
		if (!stored) {
			return null;
		}

		const metadata = JSON.parse(stored) as DaytonaInstanceMetadata;
		this.metadataCache.set(instanceId, metadata);
		return metadata;
	}

	private async writeMetadata(instanceId: string, metadata: DaytonaInstanceMetadata): Promise<void> {
		await env.VibecoderStore.put(this.getMetadataKey(instanceId), JSON.stringify(metadata));
		this.metadataCache.set(instanceId, metadata);
	}

	private async deleteMetadata(instanceId: string): Promise<void> {
		await env.VibecoderStore.delete(this.getMetadataKey(instanceId));
		this.metadataCache.delete(instanceId);
		this.sandboxCache.delete(instanceId);
	}

	private extractTemplateFileList(files: TemplateFile[], targetFile: string): string[] {
		const metadataFile = files.find((file) => file.filePath === targetFile);
		if (!metadataFile) {
			return [];
		}

		try {
			const parsed = JSON.parse(metadataFile.fileContents) as unknown;
			return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
		} catch {
			return [];
		}
	}

	private async ensureDirectories(sandbox: Sandbox, workspacePath: string, files: TemplateFile[]): Promise<void> {
		const directories = new Set<string>();

		for (const file of files) {
			const absolutePath = this.toAbsoluteSandboxPath(workspacePath, file.filePath);
			let current = this.parentDirectory(absolutePath);

			while (current && current.startsWith(workspacePath)) {
				directories.add(current);
				current = this.parentDirectory(current);
			}
		}

		const sortedDirectories = Array.from(directories).sort((left, right) => left.length - right.length);
		for (const directory of sortedDirectories) {
			await sandbox.fs.createFolder(directory, '755');
		}
	}

	private async uploadFilesToSandbox(sandbox: Sandbox, workspacePath: string, files: TemplateFile[]): Promise<void> {
		if (files.length === 0) {
			return;
		}

		await this.ensureDirectories(sandbox, workspacePath, files);

		await sandbox.fs.uploadFiles(
			files.map((file) => ({
				source: Buffer.from(file.fileContents, 'utf8'),
				destination: this.toAbsoluteSandboxPath(workspacePath, file.filePath),
			})),
		);
	}

	private async startPreviewCommand(
		sandbox: Sandbox,
		workspacePath: string,
		initCommand: string,
		envVars?: Record<string, string>,
	): Promise<{ sessionId: string; commandId: string }> {
		const sessionId = `preview-${sandbox.id}`;
		await sandbox.process.createSession(sessionId);

		const response = await sandbox.process.executeSessionCommand(
			sessionId,
			{
				command: `sh -lc ${JSON.stringify(initCommand)}`,
				runAsync: true,
			},
			this.getTimeoutSeconds(PREVIEW_BOOT_TIMEOUT_MS),
		);

		if (!response.cmdId) {
			throw new Error('Daytona did not return a command id for the preview process');
		}

		if (envVars && Object.keys(envVars).length > 0) {
			this.logger.info('Preview command started with app-specific env vars', {
				keys: Object.keys(envVars),
				workspacePath,
				sessionId,
				commandId: response.cmdId,
			});
		}

		return {
			sessionId,
			commandId: response.cmdId,
		};
	}

	private parseListeningPorts(output: string): number[] {
		const ports = new Set<number>();
		const portRegex = /:(\d{2,5})\b/g;

		for (const line of output.split(/\r?\n/u)) {
			let match = portRegex.exec(line);
			while (match) {
				const port = Number(match[1]);
				if (port >= 1024 && port <= 65535) {
					ports.add(port);
				}
				match = portRegex.exec(line);
			}
			portRegex.lastIndex = 0;
		}

		return Array.from(ports);
	}

	private parsePreviewPortFromLogs(logs: string): number | undefined {
		const match = logs.match(/\b(?:127\.0\.0\.1|0\.0\.0\.0|localhost):(\d{2,5})\b/u);
		if (!match) {
			return undefined;
		}

		const port = Number(match[1]);
		return Number.isFinite(port) ? port : undefined;
	}

	private async detectPreviewPort(sandbox: Sandbox, workspacePath: string, sessionId: string, commandId: string): Promise<number | undefined> {
		try {
			const processResult = await sandbox.process.executeCommand(
				'sh -lc "ss -ltnH 2>/dev/null || netstat -ltn 2>/dev/null"',
				workspacePath,
				undefined,
				10,
			);
			const ports = this.parseListeningPorts(processResult.result ?? '');
			const preferredPort = PREVIEW_PORT_CANDIDATES.find((port) => ports.includes(port));
			if (preferredPort) {
				return preferredPort;
			}

			const dynamicPort = ports.find((port) => port >= 3000 && port <= 9999);
			if (dynamicPort) {
				return dynamicPort;
			}
		} catch (error) {
			this.logger.warn('Failed to detect preview port from open sockets', { error });
		}

		try {
			const logs = await sandbox.process.getSessionCommandLogs(sessionId, commandId);
			return this.parsePreviewPortFromLogs(`${logs.stdout ?? ''}\n${logs.stderr ?? ''}\n${logs.output ?? ''}`);
		} catch (error) {
			this.logger.warn('Failed to detect preview port from command logs', { error });
		}

		return undefined;
	}

	private async isPreviewReachable(url: string): Promise<boolean> {
		try {
			const response = await fetch(url, {
				method: 'GET',
				redirect: 'manual',
				headers: {
					'accept': 'text/html,application/xhtml+xml',
				},
			});

			return response.status < 500;
		} catch {
			return false;
		}
	}

	private async getSignedPreviewUrl(sandbox: Sandbox, port: number): Promise<string> {
		const preview = await sandbox.getSignedPreviewUrl(
			port,
			Number(env.DAYTONA_PREVIEW_URL_TTL_SECONDS || DEFAULT_PREVIEW_TTL_SECONDS),
		);

		return preview.url;
	}

	private async waitForPreview(
		sandbox: Sandbox,
		workspacePath: string,
		sessionId: string,
		commandId: string,
	): Promise<DaytonaPreviewState> {
		const startedAt = Date.now();

		while (Date.now() - startedAt < PREVIEW_BOOT_TIMEOUT_MS) {
			const command = await sandbox.process.getSessionCommand(sessionId, commandId) as DaytonaSessionCommand;
			const exitCode = typeof command.exitCode === 'number' ? command.exitCode : undefined;
			if (typeof exitCode === 'number' && exitCode !== 0) {
				const logs = await sandbox.process.getSessionCommandLogs(sessionId, commandId);
				const stderr = logs.stderr || logs.output || logs.stdout || 'Preview command exited before a preview port was available';
				throw new Error(stderr);
			}

			const port = await this.detectPreviewPort(sandbox, workspacePath, sessionId, commandId);
			if (port) {
				const previewURL = await this.getSignedPreviewUrl(sandbox, port);
				if (await this.isPreviewReachable(previewURL)) {
					return {
						port,
						previewURL,
					};
				}
			}

			await sandbox.refreshActivity();
			await this.sleep(PREVIEW_POLL_INTERVAL_MS);
		}

		throw new Error('Timed out while waiting for Daytona preview to become reachable');
	}

	private async buildInstanceDetails(sandbox: Sandbox, metadata: DaytonaInstanceMetadata): Promise<InstanceDetails> {
		await sandbox.refreshData();
		const startTime = new Date(metadata.startTime);
		const uptime = Math.max(0, Math.floor((Date.now() - startTime.getTime()) / 1000));
		const previewURL = metadata.previewPort ? await this.getSignedPreviewUrl(sandbox, metadata.previewPort) : metadata.previewURL;

		return {
			runId: sandbox.id,
			startTime,
			uptime,
			previewURL,
			tunnelURL: metadata.tunnelURL,
			directory: metadata.workspacePath,
			serviceDirectory: metadata.workspacePath,
			processId: metadata.commandId,
		};
	}

	private async downloadRequestedFiles(
		sandbox: Sandbox,
		metadata: DaytonaInstanceMetadata,
		filePaths: string[],
	): Promise<GetFilesResponseType> {
		const files: TemplateFile[] = [];
		const errors: Array<{ file: string; error: string }> = [];

		for (const filePath of filePaths) {
			try {
				const contents = await sandbox.fs.downloadFile(this.toAbsoluteSandboxPath(metadata.workspacePath, filePath));
				files.push({
					filePath,
					fileContents: contents.toString('utf8'),
				});
			} catch (error) {
				errors.push({
					file: filePath,
					error: error instanceof Error ? error.message : 'Failed to download file',
				});
			}
		}

		return {
			success: errors.length === 0,
			files,
			errors: errors.length > 0 ? errors : undefined,
			error: errors.length > 0 ? 'Failed to fetch one or more files' : undefined,
		};
	}

	private async listAllProjectFiles(sandbox: Sandbox, metadata: DaytonaInstanceMetadata): Promise<GetFilesResponse> {
		const entries = await sandbox.fs.listFiles(metadata.workspacePath, { depth: 12 });
		const fileEntries = entries.filter((entry) => !entry.isDir && typeof entry.path === 'string');
		const filePaths = fileEntries
			.map((entry) => entry.path)
			.filter((path): path is string => typeof path === 'string')
			.map((path) => path.replace(`${metadata.workspacePath}/`, ''));
		return this.downloadRequestedFiles(sandbox, metadata, filePaths);
	}

	private async parseLintIssues(output: string): Promise<CodeIssue[]> {
		try {
			const parsed = JSON.parse(output) as Array<{
				filePath: string;
				messages?: Array<{
					message: string;
					line?: number;
					column?: number;
					severity: number;
					ruleId?: string | null;
				}>;
			}>;

			return parsed.flatMap((fileResult) =>
				(fileResult.messages ?? []).map((message) => ({
					message: message.message,
					filePath: fileResult.filePath,
					line: message.line ?? 0,
					column: message.column,
					severity: message.severity === 2 ? 'error' : message.severity === 1 ? 'warning' : 'info',
					ruleId: message.ruleId ?? undefined,
					source: 'eslint',
				})),
			);
		} catch {
			return [];
		}
	}

	private parseTypecheckIssues(output: string): CodeIssue[] {
		const issues: CodeIssue[] = [];
		const regex = /^(.+?)\((\d+),(\d+)\): error TS(\d+): (.+)$/gmu;
		let match = regex.exec(output);

		while (match) {
			issues.push({
				filePath: match[1].trim(),
				line: Number(match[2]),
				column: Number(match[3]),
				message: match[5].trim(),
				severity: 'error',
				ruleId: `TS${match[4]}`,
				source: 'typescript',
			});
			match = regex.exec(output);
		}

		return issues;
	}

	private buildRuntimeErrorsFromLogs(stderr: string): RuntimeError[] {
		const message = stderr.trim();
		if (!message) {
			return [];
		}

		return [
			{
				timestamp: new Date().toISOString(),
				level: 50,
				message,
				rawOutput: stderr,
			},
		];
	}

	async initialize(): Promise<void> {
		this.getClient();
	}

	async createInstance(options: InstanceCreationRequest): Promise<BootstrapResponse> {
		const donttouchFiles = this.extractTemplateFileList(options.files, '.donttouch_files.json');
		const redactedFiles = this.extractTemplateFileList(options.files, '.redacted_files.json');

		try {
			const sandbox = await this.getClient().create({
				name: this.sanitizeName(options.projectName),
				language: 'typescript',
				envVars: options.envVars,
				autoStopInterval: Number(env.DAYTONA_AUTO_STOP_INTERVAL || DEFAULT_AUTO_STOP_MINUTES),
				autoDeleteInterval: Number(env.DAYTONA_AUTO_DELETE_INTERVAL || DEFAULT_AUTO_DELETE_MINUTES),
				public: false,
				labels: {
					[MANAGED_BY_LABEL]: MANAGED_BY_VALUE,
					[SESSION_LABEL]: this.sandboxId,
					[PROJECT_LABEL]: this.sanitizeName(options.projectName),
				},
			}, { timeout: 90 });

			await sandbox.waitUntilStarted(90);
			const workspacePath = (await sandbox.getWorkDir()) ?? (await sandbox.getUserHomeDir()) ?? '/home/daytona';

			await this.uploadFilesToSandbox(sandbox, workspacePath, options.files);
			const { sessionId, commandId } = await this.startPreviewCommand(
				sandbox,
				workspacePath,
				options.initCommand,
				options.envVars,
			);
			const preview = await this.waitForPreview(sandbox, workspacePath, sessionId, commandId);

			const metadata: DaytonaInstanceMetadata = {
				projectName: options.projectName,
				startTime: new Date().toISOString(),
				workspacePath,
				sessionId,
				commandId,
				previewPort: preview.port,
				previewURL: preview.previewURL,
				tunnelURL: preview.previewURL,
				donttouchFiles,
				redactedFiles,
			};

			await this.writeMetadata(sandbox.id, metadata);
			this.sandboxCache.set(sandbox.id, sandbox);

			return {
				success: true,
				runId: sandbox.id,
				processId: commandId,
				previewURL: preview.previewURL,
				tunnelURL: preview.previewURL,
				message: `Successfully created Daytona sandbox ${sandbox.id}`,
			};
		} catch (error) {
			this.logger.error('Failed to create Daytona sandbox instance', error, { projectName: options.projectName });
			return {
				success: false,
				error: `Failed to create Daytona sandbox instance: ${error instanceof Error ? error.message : 'Unknown error'}`,
			};
		}
	}

	async listAllInstances(): Promise<ListInstancesResponse> {
		try {
			const instances: InstanceDetails[] = [];
			for await (const sandbox of this.getClient().list({ labels: { [MANAGED_BY_LABEL]: MANAGED_BY_VALUE } })) {
				const metadata = await this.readMetadata(sandbox.id);
				if (!metadata) {
					continue;
				}
				instances.push(await this.buildInstanceDetails(sandbox, metadata));
			}

			return {
				success: true,
				instances,
				count: instances.length,
			};
		} catch (error) {
			return {
				success: false,
				instances: [],
				count: 0,
				error: `Failed to list Daytona sandboxes: ${error instanceof Error ? error.message : 'Unknown error'}`,
			};
		}
	}

	async getInstanceDetails(instanceId: string): Promise<GetInstanceResponse> {
		try {
			const metadata = await this.readMetadata(instanceId);
			if (!metadata) {
				return {
					success: false,
					error: `Instance ${instanceId} not found`,
				};
			}

			const sandbox = await this.getSandbox(instanceId);
			return {
				success: true,
				instance: await this.buildInstanceDetails(sandbox, metadata),
			};
		} catch (error) {
			return {
				success: false,
				error: `Failed to get Daytona instance details: ${error instanceof Error ? error.message : 'Unknown error'}`,
			};
		}
	}

	async getInstanceStatus(instanceId: string): Promise<BootstrapStatusResponse> {
		try {
			const metadata = await this.readMetadata(instanceId);
			if (!metadata) {
				return {
					success: false,
					pending: false,
					isHealthy: false,
					error: `Instance ${instanceId} not found`,
				};
			}

			const sandbox = await this.getSandbox(instanceId);
			await sandbox.refreshData();

			const command = await sandbox.process.getSessionCommand(metadata.sessionId, metadata.commandId) as DaytonaSessionCommand;
			const exitCode = typeof command.exitCode === 'number' ? command.exitCode : undefined;
			const isHealthy = sandbox.state === 'started' && (typeof exitCode !== 'number' || exitCode === 0);

			let previewURL = metadata.previewURL;
			if (metadata.previewPort) {
				previewURL = await this.getSignedPreviewUrl(sandbox, metadata.previewPort);
				await this.writeMetadata(instanceId, { ...metadata, previewURL, tunnelURL: previewURL });
			}

			return {
				success: true,
				pending: false,
				isHealthy,
				message: isHealthy ? 'Daytona sandbox is healthy' : 'Daytona sandbox preview process is not healthy',
				previewURL,
				tunnelURL: previewURL,
				processId: metadata.commandId,
			};
		} catch (error) {
			return {
				success: false,
				pending: false,
				isHealthy: false,
				error: `Failed to get Daytona instance status: ${error instanceof Error ? error.message : 'Unknown error'}`,
			};
		}
	}

	async shutdownInstance(instanceId: string): Promise<ShutdownResponse> {
		try {
			const sandbox = await this.getSandbox(instanceId);
			await this.getClient().delete(sandbox, 90);
			await this.deleteMetadata(instanceId);
			return {
				success: true,
				message: `Successfully deleted Daytona sandbox ${instanceId}`,
			};
		} catch (error) {
			return {
				success: false,
				error: `Failed to delete Daytona sandbox: ${error instanceof Error ? error.message : 'Unknown error'}`,
			};
		}
	}

	async writeFiles(instanceId: string, files: WriteFilesRequest['files'], _commitMessage?: string): Promise<WriteFilesResponse> {
		try {
			const metadata = await this.readMetadata(instanceId);
			if (!metadata) {
				return {
					success: false,
					results: files.map((file) => ({ file: file.filePath, success: false, error: 'Instance not found' })),
					error: `Instance ${instanceId} not found`,
				};
			}

			const sandbox = await this.getSandbox(instanceId);
			await this.ensureDirectories(
				sandbox,
				metadata.workspacePath,
				files.map((file) => ({ filePath: file.filePath, fileContents: file.fileContents })),
			);

			for (const file of files) {
				await sandbox.fs.uploadFile(
					Buffer.from(file.fileContents, 'utf8'),
					this.toAbsoluteSandboxPath(metadata.workspacePath, file.filePath),
				);
			}

			return {
				success: true,
				message: `Uploaded ${files.length} files to Daytona sandbox`,
				results: files.map((file) => ({ file: file.filePath, success: true })),
			};
		} catch (error) {
			return {
				success: false,
				results: files.map((file) => ({
					file: file.filePath,
					success: false,
					error: error instanceof Error ? error.message : 'Upload failed',
				})),
				error: `Failed to upload files to Daytona sandbox: ${error instanceof Error ? error.message : 'Unknown error'}`,
			};
		}
	}

	async getFiles(instanceId: string, filePaths?: string[]): Promise<GetFilesResponse> {
		try {
			const metadata = await this.readMetadata(instanceId);
			if (!metadata) {
				return {
					success: false,
					files: [],
					error: `Instance ${instanceId} not found`,
				};
			}

			const sandbox = await this.getSandbox(instanceId);
			if (filePaths && filePaths.length > 0) {
				return this.downloadRequestedFiles(sandbox, metadata, filePaths);
			}

			return this.listAllProjectFiles(sandbox, metadata);
		} catch (error) {
			return {
				success: false,
				files: [],
				error: `Failed to fetch files from Daytona sandbox: ${error instanceof Error ? error.message : 'Unknown error'}`,
			};
		}
	}

	async getLogs(instanceId: string, _onlyRecent?: boolean, _durationSeconds?: number): Promise<GetLogsResponse> {
		try {
			const metadata = await this.readMetadata(instanceId);
			if (!metadata) {
				return {
					success: false,
					logs: { stdout: '', stderr: '' },
					error: `Instance ${instanceId} not found`,
				};
			}

			const sandbox = await this.getSandbox(instanceId);
			const logs = await sandbox.process.getSessionCommandLogs(metadata.sessionId, metadata.commandId);
			return {
				success: true,
				logs: {
					stdout: logs.stdout ?? logs.output ?? '',
					stderr: logs.stderr ?? '',
				},
			};
		} catch (error) {
			return {
				success: false,
				logs: { stdout: '', stderr: '' },
				error: `Failed to fetch Daytona logs: ${error instanceof Error ? error.message : 'Unknown error'}`,
			};
		}
	}

	async executeCommands(instanceId: string, commands: string[], timeout?: number): Promise<ExecuteCommandsResponse> {
		try {
			const metadata = await this.readMetadata(instanceId);
			if (!metadata) {
				return {
					success: false,
					results: commands.map((command) => ({
						command,
						success: false,
						output: '',
						error: 'Instance not found',
					})),
					error: `Instance ${instanceId} not found`,
				};
			}

			const sandbox = await this.getSandbox(instanceId);
			const timeoutSeconds = this.getTimeoutSeconds(timeout);
			const results = [];

			for (const command of commands) {
				const response = await sandbox.process.executeCommand(
					command,
					metadata.workspacePath,
					undefined,
					timeoutSeconds,
				);
				results.push({
					command,
					success: response.exitCode === 0,
					output: response.result ?? '',
					error: response.exitCode === 0 ? undefined : response.result ?? 'Command failed',
					exitCode: response.exitCode,
				});
			}

			const successCount = results.filter((result) => result.success).length;
			return {
				success: true,
				results,
				message: `Executed ${successCount}/${commands.length} commands successfully`,
			};
		} catch (error) {
			return {
				success: false,
				results: commands.map((command) => ({
					command,
					success: false,
					output: '',
					error: error instanceof Error ? error.message : 'Command execution failed',
				})),
				error: `Failed to execute commands in Daytona sandbox: ${error instanceof Error ? error.message : 'Unknown error'}`,
			};
		}
	}

	async updateProjectName(instanceId: string, projectName: string): Promise<boolean> {
		const metadata = await this.readMetadata(instanceId);
		if (!metadata) {
			return false;
		}

		await this.writeMetadata(instanceId, {
			...metadata,
			projectName,
		});
		return true;
	}

	async getInstanceErrors(instanceId: string, _clear?: boolean): Promise<RuntimeErrorResponse> {
		try {
			const logs = await this.getLogs(instanceId);
			if (!logs.success) {
				return {
					success: false,
					errors: [],
					hasErrors: false,
					error: logs.error,
				};
			}

			const errors = this.buildRuntimeErrorsFromLogs(logs.logs.stderr);
			return {
				success: true,
				errors,
				hasErrors: errors.length > 0,
			};
		} catch (error) {
			return {
				success: false,
				errors: [],
				hasErrors: false,
				error: `Failed to collect Daytona runtime errors: ${error instanceof Error ? error.message : 'Unknown error'}`,
			};
		}
	}

	async clearInstanceErrors(_instanceId: string): Promise<ClearErrorsResponse> {
		return {
			success: true,
			message: 'Daytona runtime error state is derived from current logs and does not require clearing',
		};
	}

	async runStaticAnalysisCode(instanceId: string, lintFiles?: string[]): Promise<StaticAnalysisResponse> {
		try {
			const metadata = await this.readMetadata(instanceId);
			if (!metadata) {
				return {
					success: false,
					lint: { issues: [] },
					typecheck: { issues: [] },
					error: `Instance ${instanceId} not found`,
				};
			}

			const sandbox = await this.getSandbox(instanceId);
			const lintTarget = lintFiles && lintFiles.length > 0 ? ` ${lintFiles.map((file) => JSON.stringify(file)).join(' ')}` : '';
			const [lintResult, typecheckResult] = await Promise.all([
				sandbox.process.executeCommand(
					`sh -lc "bunx eslint . --format json${lintTarget}"`,
					metadata.workspacePath,
					undefined,
					120,
				),
				sandbox.process.executeCommand(
					'sh -lc "bunx tsc -b --incremental --noEmit --pretty false"',
					metadata.workspacePath,
					undefined,
					120,
				),
			]);

			const lintIssues = await this.parseLintIssues(lintResult.result ?? '');
			const typecheckIssues = this.parseTypecheckIssues(typecheckResult.result ?? '');

			return {
				success: true,
				lint: {
					issues: lintIssues,
					summary: {
						errorCount: lintIssues.filter((issue) => issue.severity === 'error').length,
						warningCount: lintIssues.filter((issue) => issue.severity === 'warning').length,
						infoCount: lintIssues.filter((issue) => issue.severity === 'info').length,
					},
					rawOutput: lintResult.result ?? '',
				},
				typecheck: {
					issues: typecheckIssues,
					summary: {
						errorCount: typecheckIssues.filter((issue) => issue.severity === 'error').length,
						warningCount: typecheckIssues.filter((issue) => issue.severity === 'warning').length,
						infoCount: typecheckIssues.filter((issue) => issue.severity === 'info').length,
					},
					rawOutput: typecheckResult.result ?? '',
				},
			};
		} catch (error) {
			return {
				success: false,
				lint: { issues: [] },
				typecheck: { issues: [] },
				error: `Failed to run Daytona static analysis: ${error instanceof Error ? error.message : 'Unknown error'}`,
			};
		}
	}

	async deployToCloudflareWorkers(instanceId: string, target: DeploymentTarget = 'platform'): Promise<DeploymentResult> {
		if (target === 'user') {
			return {
				success: false,
				message: 'User-targeted deployments are not available with Daytona backup sandboxes yet',
				error: 'unsupported_target',
			};
		}

		try {
			const metadata = await this.readMetadata(instanceId);
			if (!metadata) {
				return {
					success: false,
					message: 'Daytona sandbox instance not found',
					error: `Instance ${instanceId} not found`,
				};
			}

			if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
				return {
					success: false,
					message: 'Cloudflare deployment credentials are missing',
					error: 'missing_cloudflare_credentials',
				};
			}

			const sandbox = await this.getSandbox(instanceId);
			const buildResult = await sandbox.process.executeCommand(
				'sh -lc "bun run build"',
				metadata.workspacePath,
				undefined,
				600,
			);
			if (buildResult.exitCode !== 0) {
				return {
					success: false,
					message: 'Build failed before Cloudflare deployment',
					error: buildResult.result ?? 'build_failed',
					output: buildResult.result,
				};
			}

			const deployResult = await sandbox.process.executeCommand(
				'sh -lc "bunx wrangler deploy"',
				metadata.workspacePath,
				{
					CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN,
					CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID,
				},
				900,
			);

			const deployedUrl = deployResult.result?.match(/https:\/\/[^\s]+/u)?.[0];
			if (deployResult.exitCode !== 0) {
				return {
					success: false,
					message: 'Wrangler deployment failed inside Daytona sandbox',
					error: deployResult.result ?? 'wrangler_deploy_failed',
					output: deployResult.result,
				};
			}

			return {
				success: true,
				message: 'Successfully deployed from Daytona sandbox to Cloudflare Workers',
				deployedUrl,
				output: deployResult.result,
			};
		} catch (error) {
			return {
				success: false,
				message: 'Failed to deploy from Daytona sandbox',
				error: error instanceof Error ? error.message : 'Unknown error',
			};
		}
	}
}
