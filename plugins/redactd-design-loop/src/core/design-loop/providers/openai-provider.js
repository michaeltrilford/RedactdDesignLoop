import {
  iterationSystemPrompt,
  iterationUserPrompt,
  systemPrompt,
  userPrompt
} from '../prompt.js';
import { parseProviderJson } from './parse-json.js';

function extractText(responseJson) {
  if (typeof responseJson.output_text === 'string' && responseJson.output_text.trim()) {
    return responseJson.output_text;
  }

  const chunks = [];
  for (const item of responseJson.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && typeof content.text === 'string') {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join('\n').trim();
}

export class OpenAIProvider {
  constructor(apiKey, model = process.env.OPENAI_MODEL || 'gpt-4.1-mini') {
    this.name = 'openai';
    this.apiKey = apiKey;
    this.model = model;
  }

  async requestJson(systemText, userText) {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: systemText }] },
          { role: 'user', content: [{ type: 'input_text', text: userText }] }
        ]
      })
    });

    if (!res.ok) {
      throw new Error(`OpenAI request failed: ${res.status} ${await res.text()}`);
    }

    return parseProviderJson(extractText(await res.json()));
  }

  async evaluate(input) {
    return await this.requestJson(systemPrompt(), userPrompt(input));
  }

  async iterate(input) {
    return await this.requestJson(
      iterationSystemPrompt(),
      iterationUserPrompt(input)
    );
  }
}
