import { createApp } from './app';
import { DORateLimitStore as BaseDORateLimitStore } from './services/rate-limit/DORateLimitStore';
import { UserSecretsStore } from './services/secrets/UserSecretsStore';

export { UserSecretsStore };
export const DORateLimitStore = BaseDORateLimitStore;

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		const app = createApp(env);
		return app.fetch(request, env, ctx);
	},
};
