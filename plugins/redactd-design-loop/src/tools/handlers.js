import {
  getRunOutputs,
  prepareRedactdImport,
  runDesignLoop,
  saveDesignLoopOutput,
  writeLoopArtifacts
} from '../core/design-loop/service.js';

function formatList(items, emptyText) {
  if (!Array.isArray(items) || items.length === 0) return [`- ${emptyText}`];
  return items.map((item) => `- ${item}`);
}

function formatRunDesignLoop(result) {
  const hasPrompt = typeof result.prompt === 'string' && result.prompt.trim().length > 0;
  const lines = [
    '# Loop',
    '',
    ...(hasPrompt
      ? []
      : [
          'No direction provided',
          '',
          '`run_design_loop_all`',
          '`explorationDepth: 8`',
          '`variationMode: safe`',
          '',
          '[Learn more about Loop prompts](https://redactd.xyz/design-loop)',
          ''
        ]),
    '- Execution: Codex workflow only',
    '- No local heuristic critique or fake iteration output',
    `- Review path: ${result.personaPath}`,
    `- Depth: ${result.explorationDepth} (${result.explorationLabel})`,
    `- Mode: ${result.variationLabel}`,
    '- Docs: [redactd.xyz/design-loop](https://redactd.xyz/design-loop)',
    `- Run folder: ${result.runRoot}`,
    '',
    '## Artifact Summary',
    `- Pages: ${result.summary.totalPages}`,
    `- Component types: ${result.summary.componentTypes.join(', ') || 'none'}`,
    '',
    '## Page Breakdown'
  ];

  for (const page of result.summary.pageSummaries) {
    lines.push(`- ${page.fileName}: ${page.totalNodes} nodes`);
    lines.push(`  Components: ${Object.keys(page.componentCounts).join(', ') || 'none'}`);
  }

  return lines.join('\n');
}

export async function callTool(name, args) {
  if (name === 'run_design_loop') {
    const result = await runDesignLoop(args);
    return {
      displayText: formatRunDesignLoop(result),
      data: result
    };
  }

  if (name === 'run_design_loop_users') {
    const result = await runDesignLoop({ ...args, personaPath: 'users' });
    return {
      displayText: formatRunDesignLoop(result),
      data: result
    };
  }

  if (name === 'run_design_loop_stakeholders') {
    const result = await runDesignLoop({ ...args, personaPath: 'stakeholders' });
    return {
      displayText: formatRunDesignLoop(result),
      data: result
    };
  }

  if (name === 'run_design_loop_all') {
    const result = await runDesignLoop({ ...args, personaPath: 'all' });
    return {
      displayText: formatRunDesignLoop(result),
      data: result
    };
  }

  if (name === 'get_run_outputs') {
    return await getRunOutputs(args);
  }

  if (name === 'save_design_loop_output') {
    return await saveDesignLoopOutput(args);
  }

  if (name === 'write_loop_artifacts') {
    return await writeLoopArtifacts(args);
  }

  if (name === 'prepare_redactd_import') {
    return await prepareRedactdImport(args);
  }

  throw new Error(`Unknown tool: ${name}`);
}
