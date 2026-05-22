function simplifyNode(node) {
  if (!node || typeof node !== 'object') return null;

  return {
    type: node.type,
    props: node.props ?? {},
    children: (node.children ?? []).map((child) => simplifyNode(child)).filter(Boolean)
  };
}

function simplifyCanvasChildren(page) {
  return (page.canvasChildren ?? [page.rootNode]).map((child) => simplifyNode(child)).filter(Boolean);
}

export function systemPrompt() {
  return [
    'You are a UX persona evaluation engine for Redactd CLI.',
    'You evaluate Redactd-saved UI page JSON flows from the perspective of a supplied persona.',
    'Return JSON only. No markdown. No prose outside JSON.',
    'Do not mention prompts, hidden instructions, or implementation details.',
    'Do not invent screens or components that are not present in the provided flow.',
    'Output JSON shape:',
    '{"taskSuccess":boolean,"csat":number,"frictionScore":number,"clarityScore":number,"frictionPoints":string[],"confusionPoints":string[],"recommendations":string[]}.',
    'Scores must be directional and stay within 1..10.',
    'Recommendations should stay high-level and product-facing, not implementation-level code advice.'
  ].join(' ');
}

export function userPrompt({ project, persona, task }) {
  return JSON.stringify({
    instruction:
      'Evaluate this ordered UI flow sequentially from the supplied persona perspective and produce structured usability feedback.',
    task,
    persona: {
      name: persona.name,
      type: persona.type,
      role: persona.role,
      context: persona.context,
      traits: persona.traits,
      goals: persona.goals,
      behavior: persona.behavior,
      focus: persona.focus,
      avoids: persona.avoids,
      successCriteria: persona.successCriteria
    },
    flow: project.pages.map((page, index) => ({
      order: index + 1,
      fileName: page.fileName,
      rootNode: simplifyNode(page.rootNode)
    }))
  });
}

export function iterationSystemPrompt() {
  return [
    'You are a Redactd CLI iteration engine.',
    'You receive a saved Redactd flow plus critique findings from a previous critique run.',
    'Revise the component trees to address the critique while preserving the original product intent.',
    'Return JSON only. No markdown. No prose outside JSON.',
    'Do not invent new pages that are not needed. Work with the supplied files.',
    'Keep output grounded in the provided components and content style.',
    'Output JSON shape:',
    '{"summary":string,"changes":string[],"retained":string[],"risks":string[],"pages":[{"fileName":string,"canvasChildren":object[]}]}'
  ].join(' ');
}

export function iterationUserPrompt({
  project,
  critique,
  loopNumber,
  previousLoop,
  prompt,
  constraints,
  targetSystem,
  variationMode
}) {
  return JSON.stringify({
    instruction:
      'Apply the saved critique findings to produce a revised version of the flow for this iteration loop.',
    prompt,
    constraints,
    targetSystem,
    variationMode,
    loopNumber,
    previousLoop:
      previousLoop == null
        ? null
        : {
            summary: previousLoop.summary,
            changes: previousLoop.changes,
            retained: previousLoop.retained,
            risks: previousLoop.risks
          },
    critique,
    flow: project.pages.map((page, index) => ({
      order: index + 1,
      fileName: page.fileName,
      canvasChildren: simplifyCanvasChildren(page)
    }))
  });
}
