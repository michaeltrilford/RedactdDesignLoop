import {
  iterationSystemPrompt,
  iterationUserPrompt,
  systemPrompt,
  userPrompt
} from '../prompt.js';
import { parseProviderJson } from './parse-json.js';

function extractText(json) {
  return (json.choices ?? [])
    .map((choice) => choice.message?.content)
    .filter(Boolean)
    .join('\n')
    .trim();
}

export class OpenAICompatibleProvider {
  constructor({ name, apiKey, model, baseUrl }) {
    this.name = name;
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl;
  }

  async requestJson(systemText, userText) {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemText },
          { role: 'user', content: userText }
        ]
      })
    });

    if (!res.ok) {
      throw new Error(`${this.name} request failed: ${res.status} ${await res.text()}`);
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
