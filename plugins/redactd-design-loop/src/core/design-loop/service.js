import path from 'node:path';
import { access } from 'node:fs/promises';
import { evaluatePersona } from './evaluator.js';
import { ensureDir, listFilesRecursive, readJson, writeJson, writeText } from './fs-utils.js';
import { buildProvider } from './providers/factory.js';
import { getPersonas } from './personas.js';
import { loadProject } from './project.js';
import {
  baselinePreviewPath,
  captureDesignPreviews,
  loopPreviewPath,
  resolvePreviewUrl,
  shouldCapturePreviews
} from './preview-capture.js';
import { writeCritiqueDashboard } from './reports.js';
import { writeRunManifest } from './run-manifest.js';

function slugify(value) {
  return String(value ?? 'run')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'run';
}

function makeRunId() {
  return 'design-loop-run';
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveUniqueRunRoot(outputRoot, runId) {
  let candidate = path.join(outputRoot, runId);
  let index = 2;

  while (await pathExists(candidate)) {
    candidate = path.join(outputRoot, `${runId}-${index}`);
    index += 1;
  }

  return candidate;
}

function resolvePromptText(input) {
  return String(input.prompt || '').trim();
}

function resolvePersonaScope(input) {
  return input.personaPath || 'all';
}

function resolveLoopCount(input) {
  if (typeof input.explorationDepth === 'number' && [1, 2, 4, 6, 8].includes(input.explorationDepth)) {
    return input.explorationDepth;
  }

  return 4;
}

function resolveExplorationLabel(loopCount) {
  if (loopCount === 1) return 'single focused iteration';
  if (loopCount === 2) return 'focused refinement';
  if (loopCount === 4) return 'broader exploration';
  if (loopCount === 6) return 'strong variation sweep';
  if (loopCount === 8) return 'crazy eights mode';
  return `${loopCount} loops`;
}

function resolveVariationMode(input) {
  const value = input.variationMode || input.outcomeMode;
  if (value === 'safe' || value === 'crazy' || value === 'out_of_this_world') {
    return value;
  }
  return 'safe';
}

function resolveVariationLabel(mode) {
  if (mode === 'safe') return 'Safe';
  if (mode === 'crazy') return 'Crazy';
  if (mode === 'out_of_this_world') return 'Out of this world';
  return mode;
}

function resolveDefaultProjectName(input) {
  if (input.projectPath) {
    return slugify(path.basename(path.resolve(input.projectPath)));
  }

  if (input.artifactPath) {
    return slugify(path.basename(input.artifactPath, path.extname(input.artifactPath)));
  }

  return 'codex-inline';
}

function resolveOutputRoot(input) {
  if (input.outputRoot) {
    return path.resolve(input.outputRoot);
  }

  if (input.projectPath) {
    return path.join(path.resolve(input.projectPath), 'Redactd-Design-Loop', resolveDefaultProjectName(input));
  }

  if (input.artifactPath) {
    return path.join(
      path.dirname(path.resolve(input.artifactPath)),
      'Redactd-Design-Loop',
      resolveDefaultProjectName(input)
    );
  }

  return path.join(process.cwd(), 'Redactd-Design-Loop', resolveDefaultProjectName(input));
}

function nowIso() {
  return new Date().toISOString();
}

async function writeRunStatus(runRoot, status) {
  const statusPath = path.join(runRoot, 'run-status.json');
  await writeJson(statusPath, {
    updatedAt: nowIso(),
    ...status
  });
  return statusPath;
}

async function createProjectFromPages(projectPath, pages) {
  await ensureDir(projectPath);
  for (const page of pages) {
    await writeJson(path.join(projectPath, page.fileName), page.document);
  }
  return projectPath;
}

async function materializeRunInput(runRoot, input) {
  const inputDir = path.join(runRoot, 'input');
  const projectDir = path.join(runRoot, 'project');
  await ensureDir(inputDir);
  const promptText = resolvePromptText(input);
  const loopCount = resolveLoopCount(input);

  const inputRecord = {
    prompt: promptText,
    constraints: Array.isArray(input.constraints) ? input.constraints : [],
    targetSystem: input.targetSystem || null,
    explorationDepth: loopCount,
    explorationLabel: resolveExplorationLabel(loopCount),
    variationMode: resolveVariationMode(input),
    personaPath: resolvePersonaScope(input),
    personaIds: input.personaIds || [],
    sourceProjectPath: input.projectPath ? path.resolve(input.projectPath) : null,
    sourceArtifactPath: input.artifactPath ? path.resolve(input.artifactPath) : null,
    mode: 'codex'
  };

  const promptPath = path.join(inputDir, 'prompt.json');
  await writeJson(promptPath, inputRecord);

  if (input.artifactPath) {
    const artifactPath = path.resolve(input.artifactPath);
    const artifact = await readJson(artifactPath);
    await createProjectFromPages(projectDir, [
      {
        fileName: path.basename(artifactPath),
        document: artifact
      }
    ]);
    return { promptPath, projectPath: projectDir };
  }

  if (input.projectPath) {
    return { promptPath, projectPath: path.resolve(input.projectPath) };
  }

  if (Array.isArray(input.initialPages) && input.initialPages.length > 0) {
    const pages = input.initialPages.map((page, index) => ({
      fileName: page.fileName || `page-${index + 1}.json`,
      document: page.document
    }));
    await createProjectFromPages(projectDir, pages);
    return { promptPath, projectPath: projectDir };
  }

  throw new Error('run_design_loop requires a Redactd JSON artifact via artifactPath, projectPath, or initialPages.');
}

function dedupe(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function autoSelectProvider(input) {
  if (typeof input?.provider === 'string' && input.provider.trim()) {
    return input.provider.trim();
  }
  if (process.env.REDACTD_DEV_PROVIDER === 'mock') {
    return 'mock';
  }
  if (process.env.OPENAI_API_KEY) return 'openai';
  throw new Error('Loop requires a configured provider. Set OPENAI_API_KEY.');
}

function countValues(items) {
  const counts = new Map();
  for (const item of items || []) {
    const key = String(item || '').trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function topCountedItems(counts, limit = 8) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value]) => value);
}

function serializePage(canvasChildren) {
  return {
    id: 'root',
    type: 'Root',
    props: {},
    children: [
      {
        id: 'canvas',
        type: '_Canvas',
        props: {},
        children: canvasChildren
      }
    ]
  };
}

function getTextValues(node, acc = []) {
  if (!node || typeof node !== 'object') return acc;

  for (const [key, value] of Object.entries(node.props ?? {})) {
    if ((key === 'text' || key === 'label' || key === 'title') && typeof value === 'string' && value.trim()) {
      acc.push(value.trim());
    }
  }

  for (const child of node.children ?? []) {
    getTextValues(child, acc);
  }

  return acc;
}

function summarizeProject(project) {
  const componentTypes = new Set();
  const textSamples = [];
  const pageSummaries = project.pages.map((page) => {
    for (const componentType of Object.keys(page.componentCounts ?? {})) {
      componentTypes.add(componentType);
    }

    const sampleText = dedupe(getTextValues(page.rootNode)).slice(0, 8);
    textSamples.push(...sampleText);

    return {
      fileName: page.fileName,
      totalNodes: page.totalNodes,
      componentCounts: page.componentCounts,
      textSamples: sampleText
    };
  });

  return {
    totalPages: project.pages.length,
    componentTypes: [...componentTypes].sort((a, b) => a.localeCompare(b)),
    pageSummaries,
    textSamples: dedupe(textSamples).slice(0, 20)
  };
}

async function buildLoopContext({ project, prompt, personaPath, explorationDepth, variationMode }) {
  const projectSummary = summarizeProject(project);
  const personas = await getPersonas(personaPath);

  return {
    mode: 'codex',
    engine: 'codex',
    prompt: prompt || null,
    personaPath,
    explorationDepth,
    explorationLabel: resolveExplorationLabel(explorationDepth),
    variationMode,
    variationLabel: resolveVariationLabel(variationMode),
    personas: personas.map((persona) => ({
      id: persona.id,
      name: persona.name,
      type: persona.type,
      role: persona.role,
      context: persona.context,
      traits: persona.traits,
      behavior: persona.behavior,
      focus: persona.focus,
      goals: persona.goals,
      avoids: persona.avoids,
      successCriteria: persona.successCriteria
    })),
    projectSummary
  };
}

function normalizeTextList(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean);
}

function reportSignature(report) {
  return JSON.stringify({
    frictionPoints: normalizeTextList(report.frictionPoints),
    confusionPoints: normalizeTextList(report.confusionPoints),
    recommendations: normalizeTextList(report.recommendations)
  });
}

function firstPersonaSignal(persona) {
  const focus = Array.isArray(persona?.focus) ? persona.focus.find(Boolean) : null;
  const goal = Array.isArray(persona?.goals) ? persona.goals.find(Boolean) : null;
  const success = Array.isArray(persona?.successCriteria) ? persona.successCriteria.find(Boolean) : null;
  return focus || goal || success || persona?.role || persona?.name || 'their priorities';
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function scoreOrNull(value) {
  const number = finiteNumber(value);
  return number && number > 0 ? Math.max(1, Math.min(10, number)) : null;
}

function normalizeOutputFileName(value, fallback) {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  const baseName = path.basename(raw);
  return baseName.endsWith('.json') ? baseName : `${baseName}.json`;
}

function normalizeDesignPagePayload(page, index, fallbackName = `page-${index + 1}.json`) {
  const fileName = normalizeOutputFileName(page?.fileName, fallbackName);
  const document =
    page?.document && typeof page.document === 'object'
      ? page.document
      : page && typeof page === 'object' && typeof page.type === 'string'
        ? page
        : null;

  if (!document) {
    throw new Error(`Design page ${index + 1} must include a Redactd JSON document.`);
  }

  return {
    ...page,
    fileName,
    document
  };
}

function estimateReportScores(report) {
  const frictionCount = Array.isArray(report?.frictionPoints) ? report.frictionPoints.length : 0;
  const confusionCount = Array.isArray(report?.confusionPoints) ? report.confusionPoints.length : 0;
  const recommendationCount = Array.isArray(report?.recommendations) ? report.recommendations.length : 0;
  const frictionScore = Math.min(10, Math.max(1, 2 + frictionCount + Math.floor(confusionCount / 2)));
  const clarityScore = Math.max(1, Math.min(10, 9 - confusionCount - Math.floor(frictionCount / 3)));
  const csat = Number(
    Math.max(
      1,
      Math.min(10, 8.4 - frictionCount * 0.6 - confusionCount * 0.5 + Math.min(recommendationCount, 2) * 0.1)
    ).toFixed(1)
  );

  return {
    csat,
    frictionScore,
    clarityScore,
    taskSuccess: clarityScore >= 5
  };
}

function enforceDistinctReports(reports, personasById) {
  const seen = new Map();

  for (const report of reports) {
    let signature = reportSignature(report);
    if (!seen.has(signature)) {
      seen.set(signature, report.persona.id);
      continue;
    }

    const persona = personasById.get(report.persona.id);
    const signal = firstPersonaSignal(persona);
    const recommendation = `Address ${signal} more explicitly for ${report.persona.name}.`;
    const frictionPoint = `${report.persona.name} still lacks enough support for ${signal}.`;

    report.recommendations = [...(report.recommendations || []), recommendation];
    report.frictionPoints = [...(report.frictionPoints || []), frictionPoint];

    signature = reportSignature(report);
    seen.set(signature, report.persona.id);
  }

  return reports;
}

function normalizeReportList(reports, personasById) {
  return (Array.isArray(reports) ? reports : []).map((report, index) => {
    const personaInput =
      report?.persona && typeof report.persona === 'object'
        ? report.persona
        : {};
    const personaId =
      personaInput.id ||
      report?.personaId ||
      report?.persona_id ||
      report?.id ||
      `persona-${index + 1}`;
    const persona = personasById.get(personaId) || personaInput;
    const estimatedScores = estimateReportScores(report);
    const csat = scoreOrNull(report?.csat) ?? estimatedScores.csat;
    const frictionScore = scoreOrNull(report?.frictionScore) ?? estimatedScores.frictionScore;
    const clarityScore = scoreOrNull(report?.clarityScore) ?? estimatedScores.clarityScore;
    const taskSuccess =
      typeof report?.taskSuccess === 'boolean' ? report.taskSuccess : estimatedScores.taskSuccess;

    return {
      ...report,
      persona: {
        id: personaId,
        name: personaInput.name || persona.name || personaId,
        type: personaInput.type || persona.type || null,
        role: personaInput.role || persona.role || null
      },
      frictionPoints: Array.isArray(report?.frictionPoints) ? report.frictionPoints : [],
      confusionPoints: Array.isArray(report?.confusionPoints) ? report.confusionPoints : [],
      recommendations: Array.isArray(report?.recommendations) ? report.recommendations : [],
      csat,
      taskSuccess,
      frictionScore,
      clarityScore
    };
  });
}

function validateCritiqueReports(reports) {
  if (!Array.isArray(reports) || reports.length === 0) {
    throw new Error('write_loop_artifacts requires non-empty critique reports.');
  }

  const seenById = new Set();
  const seenSignatures = new Map();

  for (const report of reports) {
    const personaId = report?.persona?.id;
    if (!personaId) {
      throw new Error('Each critique report must include persona.id.');
    }
    if (seenById.has(personaId)) {
      throw new Error(`Duplicate critique report for persona: ${personaId}`);
    }
    seenById.add(personaId);

    const frictionPoints = normalizeTextList(report.frictionPoints);
    const confusionPoints = normalizeTextList(report.confusionPoints);
    const recommendations = normalizeTextList(report.recommendations);

    if (frictionPoints.length === 0 && confusionPoints.length === 0 && recommendations.length === 0) {
      throw new Error(`Critique report for ${personaId} is empty.`);
    }

    const signature = reportSignature(report);
    if (seenSignatures.has(signature)) {
      throw new Error(
        `Critique reports for ${seenSignatures.get(signature)} and ${personaId} are duplicated. Persona reports must be distinct.`
      );
    }
    seenSignatures.set(signature, personaId);
  }
}

function validateCritiqueSummary(summary) {
  if (!summary || typeof summary !== 'object') {
    throw new Error('write_loop_artifacts requires a critique summary object.');
  }

  const requiredLists = [
    'strongestFrictionFindings',
    'strongestConfusionFindings',
    'topRecommendations'
  ];

  for (const key of requiredLists) {
    const values = normalizeTextList(summary[key]);
    if (values.length === 0) {
      summary[key] = [];
    }
  }

  const layeredLists = ['consensusFindings', 'userOnlyFindings', 'stakeholderOnlyFindings', 'outlierFindings'];
  const layeredCount = layeredLists.filter((key) => normalizeTextList(summary[key]).length > 0).length;
  if (layeredCount === 0) {
    summary.consensusFindings = [
      ...(summary.strongestFrictionFindings || []),
      ...(summary.strongestConfusionFindings || [])
    ].slice(0, 4);
  }
}

async function writeBaselineDesign(project, critiqueDir) {
  const designDir = path.join(critiqueDir, 'design');
  await ensureDir(designDir);
  for (const page of project.pages) {
    await writeJson(path.join(designDir, page.fileName), serializePage(page.canvasChildren ?? [page.rootNode]));
  }
}

async function writeOutputsGuide(runRoot, context) {
  const lines = [
    '# Outputs',
    '',
    'This run is prepared for Codex to write critique and iteration artifacts.',
    '',
    '## Configuration',
    '',
    `- Engine: ${context.engine}`,
    `- Persona path: ${context.personaPath}`,
    `- Exploration depth: ${context.explorationDepth} (${context.explorationLabel})`,
    `- Variation mode: ${context.variationLabel}`,
    '',
    '## Folder Guide',
    '',
    '- `input/`',
    '  Saved run configuration.',
    '- `project/`',
    '  The structural Redactd JSON used as the working source for the run.',
    '- `critique/`',
    '  Critique summary, scores, persona reports, and baseline design.',
    '- `iteration/`',
    '  One folder per loop with `summary.json` and `design/` files.',
    '- `final/`',
    '  Saved chosen outputs after review.',
    '',
    '## Known Component Types',
    '',
    ...(context.projectSummary.componentTypes.length > 0
      ? context.projectSummary.componentTypes.map((type) => `- ${type}`)
      : ['- none found'])
  ];

  await writeText(path.join(runRoot, 'OUTPUTS.md'), lines.join('\n'));
}

async function writeRunReadme(runRoot) {
  const lines = [
    '# Redactd Design Loop Run',
    '',
    'Drag this folder directly into https://redactd.xyz/design-loop to view the dashboard overview of the findings.',
    '',
    'To work with a generated iteration in the editor canvas, drag one of these files into Redactd:',
    '',
    '- `iteration/loop-1/design/*.json`',
    '- `iteration/loop-2/design/*.json`',
    '- `iteration/loop-3/design/*.json`',
    '- `iteration/loop-4/design/*.json`',
    '- `iteration/loop-5/design/*.json`',
    '- `iteration/loop-6/design/*.json`',
    '- `iteration/loop-7/design/*.json`',
    '- `iteration/loop-8/design/*.json`',
    '',
    'Use `final/*.json` when you want the selected recommended output.',
    ''
  ];

  await writeText(path.join(runRoot, 'README.md'), lines.join('\n'));
}

async function writePreparedScaffold({ runRoot, project, context, critiqueDir, iterationDir }) {
  const summaryPath = path.join(critiqueDir, 'summary.json');
  const scoresPath = path.join(critiqueDir, 'scores.json');
  const sessionPath = path.join(iterationDir, 'session.json');
  const sourceCritiquePath = path.join(iterationDir, 'source-critique.json');

  const summary = {
    mode: context.mode,
    personaPath: context.personaPath,
    explorationDepth: context.explorationDepth,
    variationMode: context.variationMode,
    status: 'prepared',
    pages: project.pages.map((page) => ({
      fileName: page.fileName,
      totalNodes: page.totalNodes,
      componentCounts: page.componentCounts
    })),
    personas: [],
    strongestFrictionFindings: [],
    strongestConfusionFindings: [],
    topRecommendations: [],
    consensusFindings: [],
    userOnlyFindings: [],
    stakeholderOnlyFindings: [],
    outlierFindings: []
  };

  const scores = {
    averageCsat: 0,
    successRate: 0
  };

  await writeJson(summaryPath, summary);
  await writeJson(scoresPath, scores);
  await writeJson(sourceCritiquePath, {
    status: 'prepared',
    scores,
    topRecommendations: [],
    topFrictionPoints: [],
    topConfusionPoints: [],
    consensusFindings: [],
    userOnlyFindings: [],
    stakeholderOnlyFindings: [],
    outlierFindings: []
  });
  await writeJson(sessionPath, {
    status: 'prepared',
    recommendedLoopNumber: null,
    loops: []
  });
  await writeCritiqueDashboard({
    project,
    reports: [],
    summary,
    scores,
    critiqueDir
  });

  return {
    summaryPath,
    scoresPath,
    sessionPath
  };
}

function summarizeCritiqueFromArtifacts(project, critique, context) {
  const reports = Array.isArray(critique.reports) ? critique.reports : [];
  const providedSummary = critique.summary && typeof critique.summary === 'object' ? critique.summary : {};

  const userReports = reports.filter((report) => String(report.persona?.type || '').toLowerCase() === 'user');
  const stakeholderReports = reports.filter((report) =>
    String(report.persona?.type || '').toLowerCase().includes('stakeholder')
  );

  const frictionCounts = countValues(reports.flatMap((report) => report.frictionPoints || []));
  const confusionCounts = countValues(reports.flatMap((report) => report.confusionPoints || []));
  const recommendationCounts = countValues(reports.flatMap((report) => report.recommendations || []));

  const userFindingCounts = countValues(
    userReports.flatMap((report) => [...(report.frictionPoints || []), ...(report.confusionPoints || [])])
  );
  const stakeholderFindingCounts = countValues(
    stakeholderReports.flatMap((report) => [...(report.frictionPoints || []), ...(report.confusionPoints || [])])
  );

  const consensusFindings = [
    ...topCountedItems(
      new Map(
        [...frictionCounts, ...confusionCounts].filter(([, count]) => count >= Math.max(2, Math.ceil(reports.length / 4)))
      ),
      4
    )
  ];

  const userOnlyFindings = topCountedItems(
    new Map(
      [...userFindingCounts.entries()].filter(([value]) => !stakeholderFindingCounts.has(value))
    ),
    4
  );

  const stakeholderOnlyFindings = topCountedItems(
    new Map(
      [...stakeholderFindingCounts.entries()].filter(([value]) => !userFindingCounts.has(value))
    ),
    4
  );

  const outlierFindings = reports
    .flatMap((report) =>
      [...(report.frictionPoints || []), ...(report.confusionPoints || [])].map((finding) => ({
        finding,
        personaName: report.persona?.name || report.persona?.id || 'persona'
      }))
    )
    .filter(({ finding }) => (frictionCounts.get(finding) || 0) + (confusionCounts.get(finding) || 0) === 1)
    .slice(0, 4)
    .map(({ finding, personaName }) => `${personaName}: ${finding}`);

  return {
    mode: context.mode,
    personaPath: context.personaPath,
    explorationDepth: context.explorationDepth,
    variationMode: context.variationMode,
    pages: project.pages.map((page) => ({
      fileName: page.fileName,
      totalNodes: page.totalNodes,
      componentCounts: page.componentCounts
    })),
    personas: reports.map((report) => ({
      id: report.persona?.id || null,
      name: report.persona?.name || null,
      type: report.persona?.type || null,
      role: report.persona?.role || null,
      taskSuccess: Boolean(report.taskSuccess),
      csat: Number(report.csat || 0),
      frictionScore: Number(report.frictionScore || 0),
      clarityScore: Number(report.clarityScore || 0)
    })),
    strongestFrictionFindings: topCountedItems(frictionCounts, 8),
    strongestConfusionFindings: topCountedItems(confusionCounts, 8),
    topRecommendations: topCountedItems(recommendationCounts, 8),
    consensusFindings:
      Array.isArray(providedSummary.consensusFindings) && providedSummary.consensusFindings.length > 0
        ? providedSummary.consensusFindings
        : consensusFindings,
    userOnlyFindings:
      Array.isArray(providedSummary.userOnlyFindings) && providedSummary.userOnlyFindings.length > 0
        ? providedSummary.userOnlyFindings
        : userOnlyFindings,
    stakeholderOnlyFindings:
      Array.isArray(providedSummary.stakeholderOnlyFindings) && providedSummary.stakeholderOnlyFindings.length > 0
        ? providedSummary.stakeholderOnlyFindings
        : stakeholderOnlyFindings,
    outlierFindings:
      Array.isArray(providedSummary.outlierFindings) && providedSummary.outlierFindings.length > 0
        ? providedSummary.outlierFindings
        : outlierFindings
  };
}

function summarizeScoresFromArtifacts(critique) {
  const reports = Array.isArray(critique.reports) ? critique.reports : [];
  const derived = {
    averageCsat:
      reports.length > 0
        ? Number((reports.reduce((sum, report) => sum + Number(report.csat || 0), 0) / reports.length).toFixed(1))
        : 0,
    successRate:
      reports.length > 0
        ? Number((reports.filter((report) => report.taskSuccess).length / reports.length).toFixed(2))
        : 0
  };

  if (!critique.scores || typeof critique.scores !== 'object') return derived;

  const scores = { ...critique.scores };
  return {
    ...scores,
    averageCsat: scoreOrNull(scores.averageCsat) ?? scoreOrNull(scores.overall) ?? derived.averageCsat,
    successRate: finiteNumber(scores.successRate) ?? derived.successRate
  };
}

async function loadSavedCritiqueReports(reportPaths) {
  const reports = [];
  for (const reportPath of reportPaths) {
    reports.push(await readJson(reportPath));
  }
  return reports;
}

async function writeLoopSessionArtifacts(runRoot, iteration) {
  const iterationDir = path.join(runRoot, 'iteration');
  await ensureDir(iterationDir);

  const loops = (Array.isArray(iteration.loops) ? iteration.loops : []).map((loop) => ({
    ...loop,
    pages: (Array.isArray(loop.pages) ? loop.pages : []).map((page, index) =>
      normalizeDesignPagePayload(page, index, `loop-${loop.loopNumber || 'x'}-page-${index + 1}.json`)
    )
  }));
  const loopSummaryPaths = [];
  const previewCaptureItems = [];

  const loopSummaryFrom = (loop) => ({
    loopNumber: loop.loopNumber,
    strategy: loop.strategy || null,
    whyThisExists: loop.whyThisExists || null,
    summary: loop.summary,
    changes: Array.isArray(loop.changes) ? loop.changes : [],
    retained: Array.isArray(loop.retained) ? loop.retained : [],
    risks: Array.isArray(loop.risks) ? loop.risks : [],
    scores:
      loop.scores && typeof loop.scores === 'object'
        ? {
            ...loop.scores,
            frictionScore: scoreOrNull(loop.scores.frictionScore) ?? scoreOrNull(loop.scores.friction),
            clarityScore: scoreOrNull(loop.scores.clarityScore) ?? scoreOrNull(loop.scores.clarity),
            csat: scoreOrNull(loop.scores.csat) ?? scoreOrNull(loop.scores.overall)
          }
        : null,
    pages: (loop.pages || []).map((page) => ({
      fileName: page.fileName,
      previewPath: page.previewPath || loopPreviewPath(loop.loopNumber, page.fileName)
    }))
  });

  for (const loop of loops) {
    const loopDir = path.join(iterationDir, `loop-${loop.loopNumber}`);
    const designDir = path.join(loopDir, 'design');
    await ensureDir(loopDir);
    await ensureDir(designDir);

    const summary = loopSummaryFrom(loop);

    const summaryPath = path.join(loopDir, 'summary.json');
    await writeJson(summaryPath, summary);
    loopSummaryPaths.push(summaryPath);

    for (const page of loop.pages || []) {
      await writeJson(path.join(designDir, page.fileName), page.document);
      const previewPath = page.previewPath || loopPreviewPath(loop.loopNumber, page.fileName);
      page.previewPath = previewPath;
      previewCaptureItems.push({
        previewPath,
        document: page.document
      });
    }
  }

  const sessionPath = path.join(iterationDir, 'session.json');
  await writeJson(sessionPath, {
    recommendedLoopNumber: iteration.recommendedLoopNumber || null,
    loops: loops.map(loopSummaryFrom)
  });

  return { sessionPath, loopSummaryPaths, previewCaptureItems };
}

async function writeSourceCritique(runRoot, summary, scores) {
  const iterationDir = path.join(runRoot, 'iteration');
  await ensureDir(iterationDir);
  const sourceCritiquePath = path.join(iterationDir, 'source-critique.json');
  await writeJson(sourceCritiquePath, {
    scores,
    topRecommendations: summary.topRecommendations || [],
    topFrictionPoints: summary.strongestFrictionFindings || [],
    topConfusionPoints: summary.strongestConfusionFindings || [],
    consensusFindings: summary.consensusFindings || [],
    userOnlyFindings: summary.userOnlyFindings || [],
    stakeholderOnlyFindings: summary.stakeholderOnlyFindings || [],
    outlierFindings: summary.outlierFindings || []
  });
  return sourceCritiquePath;
}

export async function runDesignLoop(input) {
  if (
    !input?.artifactPath &&
    !input?.projectPath &&
    !(Array.isArray(input?.initialPages) && input.initialPages.length > 0)
  ) {
    throw new Error('run_design_loop requires a Redactd JSON artifact via artifactPath, projectPath, or initialPages.');
  }

  const promptText = resolvePromptText(input);
  const personaPath = resolvePersonaScope(input);
  const explorationDepth = resolveLoopCount(input);
  const variationMode = resolveVariationMode(input);
  const runId = makeRunId();
  const runRoot = await resolveUniqueRunRoot(resolveOutputRoot(input), runId);
  const { promptPath, projectPath } = await materializeRunInput(runRoot, input);
  const project = await loadProject(projectPath);
  const context = await buildLoopContext({
    project,
    prompt: promptText,
    personaPath,
    explorationDepth,
    variationMode
  });

  const critiqueDir = path.join(runRoot, 'critique');
  const iterationDir = path.join(runRoot, 'iteration');
  const finalDir = path.join(runRoot, 'final');
  await ensureDir(critiqueDir);
  await ensureDir(iterationDir);
  await ensureDir(finalDir);

  const statusPath = await writeRunStatus(runRoot, {
    state: 'preparing',
    completedStages: [],
    currentStage: 'preparing',
    nextStage: 'critique',
    recommendedLoopNumber: null,
    errors: []
  });

  const contextPath = path.join(critiqueDir, 'context.json');
  await writeJson(contextPath, context);
  await writeBaselineDesign(project, critiqueDir);
  const scaffold = await writePreparedScaffold({
    runRoot,
    project,
    context,
    critiqueDir,
    iterationDir
  });

  const manifestPath = await writeRunManifest({
    projectPath,
    runRoot,
    mode: 'codex',
    contextPath,
    statusPath,
    summaryPath: scaffold.summaryPath,
    scoresPath: scaffold.scoresPath,
    reportPaths: [],
    loopSummaryPaths: [],
    sessionPath: scaffold.sessionPath
  });

  await writeOutputsGuide(runRoot, context);
  await writeRunReadme(runRoot);
  await writeRunStatus(runRoot, {
    state: 'prepared',
    completedStages: ['preparing'],
    currentStage: 'prepared',
    nextStage: 'critique',
    recommendedLoopNumber: null,
    errors: []
  });

  return {
    runId,
    mode: 'codex',
    prompt: promptText || null,
    engineMode: 'codex',
    engineLabel: 'codex',
    personaPath,
    explorationDepth,
    explorationLabel: resolveExplorationLabel(explorationDepth),
    variationMode,
    variationLabel: resolveVariationLabel(variationMode),
    runRoot,
    promptPath,
    projectPath,
    manifestPath,
    statusPath,
    contextPath,
    critiqueRunDir: critiqueDir,
    iterationSessionDir: iterationDir,
    summary: context.projectSummary,
    outputsGuidePath: path.join(runRoot, 'OUTPUTS.md')
  };
}

export async function writeLoopArtifacts(input) {
  const runRoot = path.resolve(input.runRoot);
  const manifestPath = path.join(runRoot, 'run-manifest.json');
  const manifest = await readJson(manifestPath);
  const projectPath = path.join(runRoot, 'project');
  const project = await loadProject(projectPath);
  const context = manifest.contextPath ? await readJson(path.join(runRoot, manifest.contextPath)) : {
    mode: 'codex',
    personaPath: 'all',
    explorationDepth: 8,
    variationMode: 'safe'
  };

  const critiqueDir = path.join(runRoot, 'critique');
  const jsonDir = path.join(critiqueDir, 'json');
  await ensureDir(critiqueDir);
  await ensureDir(jsonDir);
  await writeRunStatus(runRoot, {
    state: 'running',
    completedStages: ['preparing'],
    currentStage: 'critique',
    nextStage: 'iteration',
    recommendedLoopNumber: null,
    errors: []
  });

  const critique = input.critique || {};
  const personas = await getPersonas(context.personaPath);
  const personasById = new Map(personas.map((persona) => [persona.id, persona]));
  const normalizedReports = enforceDistinctReports(
    normalizeReportList(critique.reports || [], personasById),
    personasById
  );
  validateCritiqueReports(normalizedReports);
  const scores = summarizeScoresFromArtifacts({ ...critique, reports: normalizedReports });

  const reportPaths = [];
  for (const report of normalizedReports) {
    const reportId = report.persona?.id || `persona-${reportPaths.length + 1}`;
    const reportPath = path.join(jsonDir, `${reportId}.json`);
    await writeJson(reportPath, report);
    reportPaths.push(reportPath);
  }

  const savedReports = await loadSavedCritiqueReports(reportPaths);
  const summary = summarizeCritiqueFromArtifacts(project, { ...critique, reports: savedReports }, context);
  const baselinePreviewItems = project.pages.map((page) => ({
    previewPath: baselinePreviewPath(page.fileName),
    document: page.rootNode
  }));
  summary.pages = summary.pages.map((page) => ({
    ...page,
    previewPath: baselinePreviewPath(page.fileName)
  }));
  validateCritiqueSummary(summary);

  const summaryPath = path.join(critiqueDir, 'summary.json');
  const scoresPath = path.join(critiqueDir, 'scores.json');
  await writeJson(summaryPath, summary);
  await writeJson(scoresPath, scores);
  await writeCritiqueDashboard({
    project,
    reports: savedReports,
    summary,
    scores,
    critiqueDir
  });

  const iterationResult = await writeLoopSessionArtifacts(runRoot, input.iteration || { loops: [] });
  if (shouldCapturePreviews(input)) {
    await captureDesignPreviews({
      runRoot,
      previewUrl: resolvePreviewUrl(input),
      pages: [...baselinePreviewItems, ...iterationResult.previewCaptureItems]
    });
  }
  await writeSourceCritique(runRoot, summary, scores);
  await writeRunStatus(runRoot, {
    state: 'running',
    completedStages: ['preparing', 'critique'],
    currentStage: 'iteration',
    nextStage: 'final',
    recommendedLoopNumber: input.iteration?.recommendedLoopNumber || null,
    errors: []
  });

  const refreshedManifestPath = await writeRunManifest({
    projectPath,
    runRoot,
    mode: 'codex',
    contextPath: manifest.contextPath ? path.join(runRoot, manifest.contextPath) : null,
    statusPath: path.join(runRoot, 'run-status.json'),
    summaryPath,
    scoresPath,
    reportPaths,
    loopSummaryPaths: iterationResult.loopSummaryPaths,
    sessionPath: iterationResult.sessionPath,
    finalPath: manifest.finalPath ? path.join(runRoot, manifest.finalPath) : null
  });
  const statusPath = await writeRunStatus(runRoot, {
    state: 'completed',
    completedStages: ['preparing', 'critique', 'iteration'],
    currentStage: 'completed',
    nextStage: null,
    recommendedLoopNumber: input.iteration?.recommendedLoopNumber || null,
    errors: []
  });

  return {
    runRoot,
    manifestPath: refreshedManifestPath,
    statusPath,
    summaryPath,
    scoresPath,
    reportCount: reportPaths.length,
    loopCount: (input.iteration?.loops || []).length
  };
}

export async function saveDesignLoopOutput(input) {
  const runRoot = path.resolve(input.runRoot);
  const finalDir = path.join(runRoot, 'final');
  await ensureDir(finalDir);

  const pages = (Array.isArray(input.finalJson) ? input.finalJson : []).map((page, index) =>
    normalizeDesignPagePayload(page, index, 'final')
  );
  if (pages.length === 0) {
    throw new Error('save_design_loop_output requires finalJson.');
  }

  for (const page of pages) {
    await writeJson(path.join(finalDir, page.fileName), page.document);
  }

  const summaryPath = path.join(finalDir, 'summary.json');
  await writeJson(summaryPath, {
    savedAt: new Date().toISOString(),
    notes: input.notes || null,
    files: pages.map((page) => page.fileName)
  });

  const manifestFile = path.join(runRoot, 'run-manifest.json');
  try {
    const manifest = await readJson(manifestFile);
    manifest.finalPath = path.relative(runRoot, summaryPath).split(path.sep).join('/');
    manifest.statusPath = 'run-status.json';
    await writeJson(manifestFile, manifest);
  } catch {
    // Leave saved files intact even if manifest update fails.
  }

  const statusPath = await writeRunStatus(runRoot, {
    state: 'completed',
    completedStages: ['preparing', 'critique', 'iteration', 'final'],
    currentStage: 'completed',
    nextStage: null,
    recommendedLoopNumber: null,
    errors: []
  });

  return {
    runRoot,
    finalDir,
    savedFiles: pages.map((page) => page.fileName),
    summaryPath,
    statusPath
  };
}

export async function getRunOutputs(input) {
  const rootPath = path.resolve(input.projectPath);
  const manifest = await readJson(path.join(rootPath, 'run-manifest.json'));
  const result = { manifest };

  if (manifest.contextPath) {
    result.context = await readJson(path.join(rootPath, manifest.contextPath));
  }

  if (manifest.summaryPath) {
    result.summary = await readJson(path.join(rootPath, manifest.summaryPath));
  }

  if (manifest.scoresPath) {
    result.scores = await readJson(path.join(rootPath, manifest.scoresPath));
  }

  if (Array.isArray(manifest.reportPaths) && manifest.reportPaths.length > 0) {
    result.reports = [];
    for (const reportPath of manifest.reportPaths) {
      result.reports.push(await readJson(path.join(rootPath, reportPath)));
    }
  }

  if (manifest.sessionPath) {
    result.session = await readJson(path.join(rootPath, manifest.sessionPath));
  }

  if (Array.isArray(manifest.loopSummaryPaths) && manifest.loopSummaryPaths.length > 0) {
    result.loopSummaries = [];
    for (const loopSummaryPath of manifest.loopSummaryPaths) {
      result.loopSummaries.push(await readJson(path.join(rootPath, loopSummaryPath)));
    }
  }

  if (manifest.finalPath) {
    result.final = await readJson(path.join(rootPath, manifest.finalPath));
  }

  return result;
}

async function assertCompletedLoopRun(runRoot, expectedLoopCount) {
  const manifestPath = path.join(runRoot, 'run-manifest.json');
  const manifest = await readJson(manifestPath);

  if (!manifest.summaryPath) {
    throw new Error('Loop run did not complete: missing critique summary.');
  }

  if (!manifest.scoresPath) {
    throw new Error('Loop run did not complete: missing critique scores.');
  }

  if (!Array.isArray(manifest.reportPaths) || manifest.reportPaths.length === 0) {
    throw new Error('Loop run did not complete: missing persona reports.');
  }

  if (!manifest.sessionPath) {
    throw new Error('Loop run did not complete: missing iteration session.');
  }

  if (!Array.isArray(manifest.loopSummaryPaths) || manifest.loopSummaryPaths.length === 0) {
    throw new Error('Loop run did not complete: missing iteration summaries.');
  }

  if (typeof expectedLoopCount === 'number' && manifest.loopSummaryPaths.length !== expectedLoopCount) {
    throw new Error(
      `Loop run did not complete: expected ${expectedLoopCount} iteration summaries, found ${manifest.loopSummaryPaths.length}.`
    );
  }

  const session = await readJson(path.join(runRoot, manifest.sessionPath));
  if (!session.recommendedLoopNumber) {
    throw new Error('Loop run did not complete: missing recommended loop number.');
  }

  return {
    manifestPath,
    session,
    manifest
  };
}

export async function prepareRedactdImport(input) {
  const pages = Array.isArray(input.finalJson) ? input.finalJson : [];

  return {
    targetSystem: input.targetSystem || null,
    reviewRequired: true,
    files: pages.map((page) => ({
      fileName: page.fileName,
      document: page.document
    }))
  };
}

export async function completeLoopRun(input) {
  const prep = await runDesignLoop(input);
  const runRoot = prep.runRoot;
  const context = await readJson(path.join(runRoot, 'critique', 'context.json'));
  const project = await loadProject(prep.projectPath);
  const providerName = autoSelectProvider(input);
  const provider = buildProvider(providerName, input?.model);
  const personas = await getPersonas(context.personaPath);
  const personasById = new Map(personas.map((persona) => [persona.id, persona]));
  const reports = [];
  for (const persona of personas) {
    reports.push(await evaluatePersona(project, persona, provider));
  }
  enforceDistinctReports(reports, personasById);

  const critiqueInput = { reports };
  const synthesizedSummary = summarizeCritiqueFromArtifacts(project, critiqueInput, context);
  const synthesizedScores = summarizeScoresFromArtifacts(critiqueInput);
  const critiqueForIteration = {
    runName: path.basename(runRoot),
    runDir: path.join(runRoot, 'critique'),
    summary: synthesizedSummary,
    scores: synthesizedScores,
    reports,
    topRecommendations: synthesizedSummary.topRecommendations || [],
    topFrictionPoints: synthesizedSummary.strongestFrictionFindings || [],
    topConfusionPoints: synthesizedSummary.strongestConfusionFindings || []
  };

  const iteration = {
    recommendedLoopNumber: null,
    loops: []
  };

  let previousLoop = null;
  for (let loopNumber = 1; loopNumber <= prep.explorationDepth; loopNumber += 1) {
    const result = await provider.iterate({
      project,
      critique: critiqueForIteration,
      loopNumber,
      previousLoop,
      prompt: prep.prompt,
      constraints: input?.constraints,
      targetSystem: input?.targetSystem,
      variationMode: prep.variationMode
    });

    const pages = Array.isArray(result.pages) ? result.pages : [];
    const normalizedLoop = {
      loopNumber,
      strategy: result.strategy || null,
      whyThisExists: result.whyThisExists || null,
      summary: typeof result.summary === 'string' ? result.summary : `Loop ${loopNumber} iteration output.`,
      changes: Array.isArray(result.changes) ? result.changes : [],
      retained: Array.isArray(result.retained) ? result.retained : [],
      risks: Array.isArray(result.risks) ? result.risks : [],
      pages:
        pages.length > 0
          ? pages.map((page) => ({
              fileName: page.fileName,
              document: serializePage(Array.isArray(page.canvasChildren) ? page.canvasChildren : [])
            }))
          : project.pages.map((page) => ({
              fileName: page.fileName,
              document: serializePage(page.canvasChildren ?? [page.rootNode])
            }))
    };

    iteration.loops.push(normalizedLoop);
    previousLoop = {
      summary: normalizedLoop.summary,
      changes: normalizedLoop.changes,
      retained: normalizedLoop.retained,
      risks: normalizedLoop.risks
    };
  }

  iteration.recommendedLoopNumber = Math.min(4, iteration.loops.length || 1);

  await writeLoopArtifacts({
    runRoot,
    critique: {
      summary: synthesizedSummary,
      scores: synthesizedScores,
      reports
    },
    iteration
  });

  const completion = await assertCompletedLoopRun(runRoot, iteration.loops.length);

  return {
    ...prep,
    manifestPath: completion.manifestPath,
    recommendedLoopNumber: completion.session.recommendedLoopNumber
  };
}
