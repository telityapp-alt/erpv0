import { SandboxSdkClient } from "./sandboxSdkClient";
import { RemoteSandboxServiceClient } from "./remoteSandboxService";
import { DaytonaSandboxServiceClient } from "./daytonaSandboxService";
import { BaseSandboxService } from "./BaseSandboxService";
import { env } from 'cloudflare:workers'

export function getSandboxService(sessionId: string, agentId: string): BaseSandboxService {
    const hasRunnerConfig = !!env.SANDBOX_SERVICE_URL && !!env.SANDBOX_SERVICE_API_KEY;
    const hasDaytonaConfig = !!env.DAYTONA_API_KEY;
    if (env.SANDBOX_SERVICE_TYPE == 'runner' && hasRunnerConfig) {
        console.log("[getSandboxService] Using runner service for sandboxing");
        return new RemoteSandboxServiceClient(sessionId);
    }
    if (env.SANDBOX_SERVICE_TYPE == 'runner' && !hasRunnerConfig) {
        console.warn("[getSandboxService] SANDBOX_SERVICE_TYPE=runner but credentials are missing; falling back to built-in sandbox service");
    }
    if (env.SANDBOX_SERVICE_TYPE == 'daytona' && hasDaytonaConfig) {
        console.log("[getSandboxService] Using Daytona service for sandboxing");
        return new DaytonaSandboxServiceClient(sessionId);
    }
    if (env.SANDBOX_SERVICE_TYPE == 'daytona' && !hasDaytonaConfig) {
        console.warn("[getSandboxService] SANDBOX_SERVICE_TYPE=daytona but DAYTONA_API_KEY is missing; falling back to built-in sandbox service");
    }
    console.log("[getSandboxService] Using sandboxsdk service for sandboxing");
    return new SandboxSdkClient(sessionId, agentId);
}
