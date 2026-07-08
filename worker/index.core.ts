import { createLogger } from './logger';
import { createApp } from './app';
import { DORateLimitStore as BaseDORateLimitStore } from './services/rate-limit/DORateLimitStore';
import { UserSecretsStore } from './services/secrets/UserSecretsStore';
import { proxyToAiGateway } from './services/aigateway-proxy/controller';
import { getPreviewDomain } from './utils/urls';
import { getAgentStub } from './agents';

export { CodeGeneratorAgent } from './agents/core/codingAgent';
export { UserSecretsStore };
export const DORateLimitStore = BaseDORateLimitStore;

const logger = createLogger('CoreWorker');

async function handleBrowserServingSubdomain(request: Request, env: Env): Promise<Response> {
	const hostname = new URL(request.url).hostname;
	const subdomain = hostname.split('.')[0];
	const withoutPrefix = subdomain.substring(2);
	const lastHyphenIndex = withoutPrefix.lastIndexOf('-');

	if (lastHyphenIndex === -1) {
		return new Response('Invalid request', { status: 400 });
	}

	const agentId = withoutPrefix.substring(0, lastHyphenIndex);
	try {
		const agentStub = await getAgentStub(env, agentId);
		return await agentStub.handleBrowserFileServing(request);
	} catch (error) {
		logger.error('Failed to forward browser file request', { agentId, error });
		return new Response('Agent not found', { status: 404 });
	}
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		if (!env.CUSTOM_DOMAIN || env.CUSTOM_DOMAIN.trim() === '') {
			logger.error('FATAL: env.CUSTOM_DOMAIN is not configured.');
			return new Response('Server configuration error: Application domain is not set.', { status: 500 });
		}

		const url = new URL(request.url);
		const { hostname, pathname } = url;
		const previewDomain = getPreviewDomain(env);

		const ipRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
		if (ipRegex.test(hostname)) {
			return new Response('Access denied. Please use the assigned domain name.', { status: 403 });
		}

		const isMainDomainRequest = hostname === env.CUSTOM_DOMAIN || hostname === 'localhost';
		const isPreviewSubdomain =
			hostname.endsWith(`.${previewDomain}`) ||
			(hostname.endsWith('.localhost') && hostname !== 'localhost');

		if (isPreviewSubdomain && hostname.split('.')[0].startsWith('b-')) {
			return handleBrowserServingSubdomain(request, env);
		}

		if (!isMainDomainRequest) {
			return new Response('Not Found', { status: 404 });
		}

		if (pathname.startsWith('/oauth/') || pathname === '/auth/callback') {
			const app = createApp(env);
			return app.fetch(request, env, ctx);
		}

		if (!pathname.startsWith('/api/')) {
			return env.ASSETS.fetch(request);
		}

		if (pathname.startsWith('/api/proxy/openai')) {
			return proxyToAiGateway(request, env, ctx);
		}

		const app = createApp(env);
		return app.fetch(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
