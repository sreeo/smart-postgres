import { z } from 'zod';

// LLM Provider configuration schema
export const llmConfigSchema = z.object({
  provider: z.enum(['openrouter', 'ollama', 'openai-compatible']),
  apiKey: z.string(),
  baseUrl: z.string().optional(),
  model: z.string().optional(),
  organization: z.string().optional(),
  defaultHeaders: z.record(z.string()).optional(),
});

export type LLMConfig = z.infer<typeof llmConfigSchema>;

// Default configurations for different providers
export const defaultConfigs: Record<LLMConfig['provider'], Partial<LLMConfig>> = {
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': 'https://github.com/your-username/smart-postgres',
      'X-Title': 'Smart Postgres',
    },
    model: 'anthropic/claude-3-sonnet-20240229',
  },
  'openai-compatible': {
    model: 'gpt-3.5-turbo',
  },
  ollama: {
    baseUrl: 'http://localhost:11434',
    model: 'codellama:7b-instruct',
  },
};

// Helper function to merge user config with defaults
export const getConfig = (userConfig: LLMConfig): LLMConfig => {
  const defaults = defaultConfigs[userConfig.provider];
  return {
    ...defaults,
    ...userConfig,
    defaultHeaders: {
      ...defaults?.defaultHeaders,
      ...userConfig.defaultHeaders,
    },
  };
};
