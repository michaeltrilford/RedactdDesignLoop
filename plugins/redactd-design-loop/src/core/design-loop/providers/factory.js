import { MockProvider } from './mock-provider.js';
import { OpenAICompatibleProvider } from './openai-compatible-provider.js';
import { OpenAIProvider } from './openai-provider.js';

export function buildProvider(name = 'openai', modelOverride) {
  if (name === 'mock') {
    return new MockProvider();
  }

  if (name === 'openai') {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('Missing OPENAI_API_KEY');
    }
    return new OpenAIProvider(process.env.OPENAI_API_KEY, modelOverride);
  }

  if (name === 'groq') {
    if (!process.env.GROQ_API_KEY) {
      throw new Error('Missing GROQ_API_KEY');
    }
    return new OpenAICompatibleProvider({
      name: 'groq',
      apiKey: process.env.GROQ_API_KEY,
      model: modelOverride || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      baseUrl: 'https://api.groq.com/openai/v1/chat/completions'
    });
  }

  if (name === 'grok') {
    if (!process.env.XAI_API_KEY) {
      throw new Error('Missing XAI_API_KEY');
    }
    return new OpenAICompatibleProvider({
      name: 'grok',
      apiKey: process.env.XAI_API_KEY,
      model: modelOverride || process.env.GROK_MODEL || 'grok-2-latest',
      baseUrl: 'https://api.x.ai/v1/chat/completions'
    });
  }

  throw new Error(`Unsupported provider: ${name}`);
}
