import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = process.cwd();
const prodVarsPath = join(projectRoot, '.prod.vars');
const tempSecretsPath = join(projectRoot, '.runtime-secrets.vars');

const allowedSecretNames = new Set([
	'CLOUDFLARE_API_TOKEN',
	'CLOUDFLARE_ACCOUNT_ID',
	'CLOUDFLARE_AI_GATEWAY_TOKEN',
	'CLOUDFLARE_AI_GATEWAY_URL',
	'EXTERNAL_AI_GATEWAY_URL',
	'EXTERNAL_AI_GATEWAY_API_KEY',
	'EXTERNAL_AI_GATEWAY_MODEL',
	'JWT_SECRET',
	'WEBHOOK_SECRET',
	'SECRETS_ENCRYPTION_KEY',
	'AI_PROXY_JWT_SECRET',
	'SANDBOX_SERVICE_API_KEY',
	'SANDBOX_SERVICE_TYPE',
	'SANDBOX_SERVICE_URL',
	'DAYTONA_API_KEY',
	'DAYTONA_API_URL',
	'DAYTONA_TARGET',
	'DAYTONA_AUTO_STOP_INTERVAL',
	'DAYTONA_AUTO_DELETE_INTERVAL',
	'DAYTONA_PREVIEW_URL_TTL_SECONDS',
	'OPENAI_API_KEY',
	'ANTHROPIC_API_KEY',
	'OPENROUTER_API_KEY',
	'GROQ_API_KEY',
	'GOOGLE_AI_STUDIO_API_KEY',
	'GOOGLE_CLIENT_ID',
	'GOOGLE_CLIENT_SECRET',
	'GITHUB_CLIENT_ID',
	'GITHUB_CLIENT_SECRET',
	'SENTRY_DSN',
]);

function readArg(flag: string): string | null {
	const index = process.argv.indexOf(flag);
	if (index === -1) {
		return null;
	}

	return process.argv[index + 1] ?? null;
}

const configPath = readArg('--config');
const workerName = readArg('--name');

if (!configPath || !workerName) {
	throw new Error('Usage: tsx scripts/sync-runtime-secrets.ts --config <wrangler-config> --name <worker-name>');
}

const lines = readFileSync(prodVarsPath, 'utf8')
	.split(/\r?\n/u)
	.map((line) => line.trim())
	.filter((line) => /^[A-Z0-9_]+=/u.test(line))
	.filter((line) => {
		const [name] = line.split('=', 1);
		return allowedSecretNames.has(name);
	})
	.filter((line) => !/=""$/u.test(line));

if (lines.length === 0) {
	throw new Error('No runtime secrets found in .prod.vars');
}

writeFileSync(tempSecretsPath, `${lines.join('\n')}\n`, 'utf8');

try {
	if (process.platform === 'win32') {
		execFileSync(
			'cmd.exe',
			[
				'/c',
				'npx',
				'wrangler',
				'secret',
				'bulk',
				tempSecretsPath,
				'--config',
				configPath,
				'--name',
				workerName,
			],
			{
				cwd: projectRoot,
				stdio: 'inherit',
			},
		);
	} else {
		execFileSync(
			'npx',
			['wrangler', 'secret', 'bulk', tempSecretsPath, '--config', configPath, '--name', workerName],
			{
				cwd: projectRoot,
				stdio: 'inherit',
			},
		);
	}
} finally {
	unlinkSync(tempSecretsPath);
}
