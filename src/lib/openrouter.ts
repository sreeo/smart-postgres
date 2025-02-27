// API Configuration
const API_CONFIG = {
  BASE_URL: 'https://openrouter.ai/api/v1',
  ENDPOINTS: {
    MODELS: 'models',
  },
  HEADERS: {
    REPO_URL: 'https://github.com/sreeo/smart-postgres',
    APP_TITLE: 'Smart Postgres',
  },
} as const;

// Model Scoring Configuration
const MODEL_SCORES = {
  // Base scores for model families
  FAMILY: {
    GPT4: 100,
    CLAUDE3: 100,
    CLAUDE2: 80,
    GPT35: 60,
    MISTRAL: 40,
    LLAMA: 30,
  },
  // Bonus scores for variants
  VARIANT: {
    OPUS: 20,
    SONNET: 10,
  },
  // Other scoring parameters
  MAX_AGE_SCORE: 100,
  MAX_CONTEXT_SCORE: 50,
  CONTEXT_DIVISOR: 1000, // Points per 1K context length
} as const;

// Model family identifiers
const MODEL_IDENTIFIERS = {
  GPT4: 'gpt-4',
  CLAUDE3: 'claude-3',
  CLAUDE2: 'claude-2',
  GPT35: 'gpt-3.5',
  MISTRAL: 'mistral',
  LLAMA: 'llama',
  OPUS: 'opus',
  SONNET: 'sonnet',
} as const;

export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  created?: number;
  pricing?: {
    prompt: string;
    completion: string;
  };
  popularity?: number;
}

export interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

export async function fetchOpenRouterModels(apiKey: string): Promise<OpenRouterModel[]> {
  try {
    const response = await fetch(`${API_CONFIG.BASE_URL}/${API_CONFIG.ENDPOINTS.MODELS}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': API_CONFIG.HEADERS.REPO_URL,
        'X-Title': API_CONFIG.HEADERS.APP_TITLE,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}`);
    }

    const data: OpenRouterModelsResponse = await response.json();
    
    // Calculate popularity score and sort models
    const modelsWithScores = data.data.map(model => ({
      ...model,
      popularity: calculatePopularityScore(model)
    }));

    // Sort by popularity (higher score first)
    return modelsWithScores.sort((a, b) => {
      if (!a.popularity || !b.popularity) return 0;
      return b.popularity - a.popularity;
    });
  } catch (error) {
    console.error('Error fetching OpenRouter models:', error);
    throw error;
  }
}

// Calculate a rough popularity score based on various factors
function calculatePopularityScore(model: OpenRouterModel): number {
  let score = 0;

  // Favor newer models
  if (model.created) {
    const ageInDays = (Date.now() - model.created * 1000) / (1000 * 60 * 60 * 24);
    score += Math.max(0, MODEL_SCORES.MAX_AGE_SCORE - ageInDays);
  }

  // Favor models with longer context windows
  if (model.context_length) {
    score += Math.min(
      MODEL_SCORES.MAX_CONTEXT_SCORE,
      model.context_length / MODEL_SCORES.CONTEXT_DIVISOR
    );
  }

  // Boost score for popular model families
  const modelId = model.id.toLowerCase();
  if (modelId.includes(MODEL_IDENTIFIERS.GPT4)) score += MODEL_SCORES.FAMILY.GPT4;
  if (modelId.includes(MODEL_IDENTIFIERS.CLAUDE3)) score += MODEL_SCORES.FAMILY.CLAUDE3;
  if (modelId.includes(MODEL_IDENTIFIERS.CLAUDE2)) score += MODEL_SCORES.FAMILY.CLAUDE2;
  if (modelId.includes(MODEL_IDENTIFIERS.GPT35)) score += MODEL_SCORES.FAMILY.GPT35;
  if (modelId.includes(MODEL_IDENTIFIERS.MISTRAL)) score += MODEL_SCORES.FAMILY.MISTRAL;
  if (modelId.includes(MODEL_IDENTIFIERS.LLAMA)) score += MODEL_SCORES.FAMILY.LLAMA;

  // Boost for opus/sonnet variants
  if (modelId.includes(MODEL_IDENTIFIERS.OPUS)) score += MODEL_SCORES.VARIANT.OPUS;
  if (modelId.includes(MODEL_IDENTIFIERS.SONNET)) score += MODEL_SCORES.VARIANT.SONNET;

  return score;
}

// Helper function to get a human-readable name from model or model ID
export function getModelDisplayName(model: OpenRouterModel | string): string {
  if (typeof model !== 'string' && model.name) {
    return model.name;
  }

  const modelId = typeof model === 'string' ? model : model.id;
  // Convert "anthropic/claude-3-opus-20240229" to "Claude 3 Opus"
  const name = modelId.split('/').pop() || modelId;
  return name
    .split('-')
    .map(part => {
      // Remove date suffix if present (e.g., 20240229)
      if (/^\d{8}$/.test(part)) return '';
      // Capitalize first letter of each part
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .filter(Boolean)
    .join(' ');
}
