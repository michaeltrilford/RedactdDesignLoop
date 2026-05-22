function stripCodeFences(text) {
  return text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function extractBalancedJsonObject(text) {
  const start = text.indexOf('{');
  if (start === -1) {
    throw new Error('Provider response did not contain a JSON object');
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  throw new Error('Provider response contained an incomplete JSON object');
}

export function parseProviderJson(text) {
  const cleaned = stripCodeFences(String(text ?? '').trim());

  try {
    return JSON.parse(cleaned);
  } catch {
    return JSON.parse(extractBalancedJsonObject(cleaned));
  }
}
