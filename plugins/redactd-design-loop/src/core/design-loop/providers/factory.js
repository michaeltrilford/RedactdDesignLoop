import { MockProvider } from './mock-provider.js';
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

  throw new Error(`Unsupported provider: ${name}`);
}
