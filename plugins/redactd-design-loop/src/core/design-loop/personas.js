import path from 'node:path';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { listFilesRecursive, readText } from './fs-utils.js';

function parseSectionedMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const result = {};
  let currentKey = null;
  const knownSections = new Set([
    'type',
    'role',
    'context',
    'traits',
    'goals',
    'behavior',
    'focus',
    'avoids',
    'success criteria'
  ]);

  for (const line of lines) {
    if (!line.trim()) continue;
    if (line.startsWith('# ')) {
      result.name = line.slice(2).trim();
      continue;
    }

    const normalizedLine = line.trim().toLowerCase();
    if (!line.startsWith('- ') && knownSections.has(normalizedLine)) {
      currentKey = normalizedLine.replace(/\s+/g, '_');
      if (!(currentKey in result)) result[currentKey] = [];
      continue;
    }

    if (!currentKey) continue;

    if (line.startsWith('- ')) {
      result[currentKey].push(line.slice(2).trim());
    } else {
      const existing = result[currentKey];
      if (Array.isArray(existing) && existing.length === 0) {
        result[currentKey] = line.trim();
      } else if (Array.isArray(existing)) {
        result[currentKey].push(line.trim());
      } else if (typeof existing === 'string') {
        result[currentKey] = `${existing} ${line.trim()}`.trim();
      } else {
        result[currentKey] = line.trim();
      }
    }
  }

  return result;
}

function normalizePersona(filePath, parsed) {
  const traits = Array.isArray(parsed.traits) ? parsed.traits : [];
  const goals = Array.isArray(parsed.goals) ? parsed.goals : [];
  const behavior = Array.isArray(parsed.behavior) ? parsed.behavior : [];
  const focus = Array.isArray(parsed.focus) ? parsed.focus : [];
  const avoids = Array.isArray(parsed.avoids) ? parsed.avoids : [];
  const successCriteria = Array.isArray(parsed.success_criteria)
    ? parsed.success_criteria
    : typeof parsed.success_criteria === 'string'
      ? [parsed.success_criteria]
      : [];

  if (!parsed.name || typeof parsed.type !== 'string' || typeof parsed.role !== 'string') {
    throw new Error(`Invalid persona format: ${filePath}`);
  }

  return {
    id: path.basename(filePath, '.md'),
    path: filePath,
    name: parsed.name,
    type: parsed.type,
    role: parsed.role,
    context: typeof parsed.context === 'string' ? parsed.context : '',
    traits,
    goals,
    behavior,
    focus,
    avoids,
    successCriteria
  };
}

async function loadPersonasFromDir(personaDir, filters = []) {
  const files = (await listFilesRecursive(personaDir)).filter(
    (filePath) => filePath.endsWith('.md') && path.basename(filePath).toLowerCase() !== 'readme.md'
  );
  const personas = [];

  for (const filePath of files) {
    const markdown = await readText(filePath);
    const parsed = parseSectionedMarkdown(markdown);
    const persona = normalizePersona(filePath, parsed);
    if (filters.length > 0 && !filters.includes(persona.id)) continue;
    personas.push(persona);
  }

  return personas;
}

function filterPersonaIdsByScope(personas, scope) {
  if (scope === 'users') {
    return personas.filter((persona) => persona.type === 'User').map((persona) => persona.id);
  }

  if (scope === 'stakeholders') {
    return personas.filter((persona) => persona.type === 'Stakeholder Hat').map((persona) => persona.id);
  }

  return personas.map((persona) => persona.id);
}

async function pathExists(dirPath) {
  try {
    await access(dirPath);
    return true;
  } catch {
    return false;
  }
}

async function resolvePersonaDir() {
  if (process.env.REDACTD_PERSONAS_DIR) {
    return path.resolve(process.env.REDACTD_PERSONAS_DIR);
  }

  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const pluginPersonaDir = path.resolve(currentDir, '../../..', 'personas');
  if (await pathExists(pluginPersonaDir)) return pluginPersonaDir;

  // Local development fallback for older checkouts before personas were packaged.
  return path.resolve(process.cwd(), '..', 'RedactdCLI', 'personas');
}

export async function getPersonas(scope = 'all', ids = []) {
  const personaDir = await resolvePersonaDir();
  const allPersonas = await loadPersonasFromDir(personaDir, []);
  const scopedIds = ids.length > 0 ? ids : filterPersonaIdsByScope(allPersonas, scope);
  const personas = allPersonas.filter((persona) => scopedIds.includes(persona.id));

  if (personas.length === 0) {
    throw new Error(`No personas selected from ${personaDir}`);
  }

  return personas;
}
