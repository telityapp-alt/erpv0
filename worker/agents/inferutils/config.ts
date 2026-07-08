import {
    AgentActionKey, 
    AgentConfig, 
    AgentConstraintConfig, 
    AIModels,
    AllModels,
    LiteModels,
    RegularModels,
} from "./config.types";
import { env } from 'cloudflare:workers';

const externalGatewayModel = env.EXTERNAL_AI_GATEWAY_MODEL?.trim() || null;

// Common configs - these are good defaults
const COMMON_AGENT_CONFIGS = {
    screenshotAnalysis: {
        name: AIModels.DISABLED,
        reasoning_effort: 'medium' as const,
        max_tokens: 8000,
        temperature: 1,
        fallbackModel: AIModels.GEMINI_2_5_FLASH,
    },
    realtimeCodeFixer: {
        name: externalGatewayModel ?? AIModels.GROK_4_1_FAST_NON_REASONING,
        reasoning_effort: 'low' as const,
        max_tokens: 32000,
        temperature: 0.2,
        fallbackModel: externalGatewayModel ?? AIModels.GEMINI_2_5_FLASH,
    },
    fastCodeFixer: {
        name: AIModels.DISABLED,
        reasoning_effort: undefined,
        max_tokens: 64000,
        temperature: 0.0,
        fallbackModel: AIModels.GEMINI_2_5_PRO,
    },
    templateSelection: {
        name: externalGatewayModel ?? AIModels.GEMINI_2_5_FLASH_LITE,
        max_tokens: 2000,
        fallbackModel: externalGatewayModel ?? AIModels.GROK_4_1_FAST_NON_REASONING,
        temperature: 1,
    },
} as const;

const SHARED_IMPLEMENTATION_CONFIG = {
    reasoning_effort: 'low' as const,
    max_tokens: 48000,
    temperature: 1,
    fallbackModel: externalGatewayModel ?? AIModels.GEMINI_2_5_PRO,
};

//======================================================================================
// ATTENTION! Platform config requires specific API keys and Cloudflare AI Gateway setup.
//======================================================================================
/* 
These are the configs used at build.cloudflare.dev 
You may need to provide API keys for these models in your environment or use 
Cloudflare AI Gateway unified billing for seamless model access without managing multiple keys.
*/
const PLATFORM_AGENT_CONFIG: AgentConfig = {
    ...COMMON_AGENT_CONFIGS,
    blueprint: {
        name: externalGatewayModel ?? AIModels.GEMINI_3_PRO_PREVIEW,
        reasoning_effort: 'high',
        max_tokens: 20000,
        fallbackModel: externalGatewayModel ?? AIModels.GEMINI_2_5_FLASH,
        temperature: 1.0,
    },
    projectSetup: {
        name: externalGatewayModel ?? AIModels.GROK_4_1_FAST,
        reasoning_effort: 'medium',
        max_tokens: 8000,
        temperature: 1,
        fallbackModel: externalGatewayModel ?? AIModels.GEMINI_2_5_PRO,
    },
    phaseGeneration: {
        name: externalGatewayModel ?? AIModels.GEMINI_3_FLASH_PREVIEW,
        reasoning_effort: 'medium',
        max_tokens: 8000,
        temperature: 1,
        fallbackModel: externalGatewayModel ?? AIModels.OPENAI_5_MINI,
    },
    firstPhaseImplementation: {
        name: externalGatewayModel ?? AIModels.GEMINI_3_FLASH_PREVIEW,
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    phaseImplementation: {
        name: externalGatewayModel ?? AIModels.GEMINI_3_FLASH_PREVIEW,
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    conversationalResponse: {
        name: externalGatewayModel ?? AIModels.GROK_4_1_FAST,
        reasoning_effort: 'low',
        max_tokens: 4000,
        temperature: 1,
        fallbackModel: externalGatewayModel ?? AIModels.GEMINI_2_5_FLASH,
    },
    deepDebugger: {
        name: externalGatewayModel ?? AIModels.GROK_4_1_FAST,
        reasoning_effort: 'high',
        max_tokens: 8000,
        temperature: 1,
        fallbackModel: externalGatewayModel ?? AIModels.GEMINI_2_5_PRO,
    },
    fileRegeneration: {
        name: externalGatewayModel ?? AIModels.GROK_4_1_FAST_NON_REASONING,
        reasoning_effort: 'low',
        max_tokens: 16000,
        temperature: 0.0,
        fallbackModel: externalGatewayModel ?? AIModels.GROK_CODE_FAST_1,
    },
    agenticProjectBuilder: {
        name: externalGatewayModel ?? AIModels.GEMINI_3_FLASH_PREVIEW,
        reasoning_effort: 'medium',
        max_tokens: 8000,
        temperature: 1,
        fallbackModel: externalGatewayModel ?? AIModels.GEMINI_2_5_PRO,
    },
};

//======================================================================================
// Default Gemini-only config (most likely used in your deployment)
//======================================================================================
/* These are the default out-of-the box gemini-only models used when PLATFORM_MODEL_PROVIDERS is not set */
const DEFAULT_AGENT_CONFIG: AgentConfig = {
    ...COMMON_AGENT_CONFIGS,
    templateSelection: {
        name: externalGatewayModel ?? AIModels.GEMINI_2_5_FLASH_LITE,
        max_tokens: 2000,
        fallbackModel: externalGatewayModel ?? AIModels.GEMINI_2_5_FLASH,
        temperature: 0.6,
    },
    blueprint: {
        name: externalGatewayModel ?? AIModels.GEMINI_3_FLASH_PREVIEW,
        reasoning_effort: 'high',
        max_tokens: 64000,
        fallbackModel: externalGatewayModel ?? AIModels.GEMINI_2_5_PRO,
        temperature: 1,
    },
    projectSetup: {
        name: externalGatewayModel ?? AIModels.GEMINI_3_FLASH_PREVIEW,
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    phaseGeneration: {
        name: externalGatewayModel ?? AIModels.GEMINI_3_FLASH_PREVIEW,
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    firstPhaseImplementation: {
        name: externalGatewayModel ?? AIModels.GEMINI_3_FLASH_PREVIEW,
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    phaseImplementation: {
        name: externalGatewayModel ?? AIModels.GEMINI_3_FLASH_PREVIEW,
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    conversationalResponse: {
        name: externalGatewayModel ?? AIModels.GEMINI_2_5_FLASH,
        reasoning_effort: 'low',
        max_tokens: 4000,
        temperature: 0,
        fallbackModel: externalGatewayModel ?? AIModels.GEMINI_2_5_PRO,
    },
    deepDebugger: {
        name: externalGatewayModel ?? AIModels.GEMINI_3_FLASH_PREVIEW,
        reasoning_effort: 'high',
        max_tokens: 8000,
        temperature: 1,
        fallbackModel: externalGatewayModel ?? AIModels.GEMINI_2_5_FLASH,
    },
    fileRegeneration: {
        name: externalGatewayModel ?? AIModels.GEMINI_3_FLASH_PREVIEW,
        reasoning_effort: 'low',
        max_tokens: 32000,
        temperature: 1,
        fallbackModel: externalGatewayModel ?? AIModels.GEMINI_2_5_FLASH,
    },
    agenticProjectBuilder: {
        name: externalGatewayModel ?? AIModels.GEMINI_3_FLASH_PREVIEW,
        reasoning_effort: 'high',
        max_tokens: 8000,
        temperature: 1,
        fallbackModel: externalGatewayModel ?? AIModels.GEMINI_2_5_FLASH,
    },
};

export const AGENT_CONFIG: AgentConfig = env.PLATFORM_MODEL_PROVIDERS 
    ? PLATFORM_AGENT_CONFIG 
    : DEFAULT_AGENT_CONFIG;


export const AGENT_CONSTRAINTS: Map<AgentActionKey, AgentConstraintConfig> = new Map([
	['fastCodeFixer', {
		allowedModels: new Set([AIModels.DISABLED]),
		enabled: true,
	}],
	['realtimeCodeFixer', {
		allowedModels: new Set([AIModels.DISABLED]),
		enabled: true,
	}],
	['fileRegeneration', {
		allowedModels: new Set(AllModels),
		enabled: true,
	}],
	['phaseGeneration', {
		allowedModels: new Set(AllModels),
		enabled: true,
	}],
	['projectSetup', {
		allowedModels: new Set([...RegularModels, AIModels.GEMINI_2_5_PRO]),
		enabled: true,
	}],
	['conversationalResponse', {
		allowedModels: new Set(RegularModels),
		enabled: true,
	}],
	['templateSelection', {
		allowedModels: new Set(LiteModels),
		enabled: true,
	}],
]);
