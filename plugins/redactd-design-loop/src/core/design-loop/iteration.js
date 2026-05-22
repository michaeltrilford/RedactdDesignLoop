import path from 'node:path';
import { ensureDir, writeJson } from './fs-utils.js';

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

export async function runIterationSession({
  project,
  critique,
  provider,
  loops,
  outputRoot,
  prompt,
  constraints,
  targetSystem,
  variationMode
}) {
  await ensureDir(outputRoot);

  const loopResults = [];
  let previousLoop = null;

  for (let loopNumber = 1; loopNumber <= loops; loopNumber += 1) {
    const result = await provider.iterate({
      project,
      critique,
      loopNumber,
      previousLoop,
      prompt,
      constraints,
      targetSystem,
      variationMode
    });

    loopResults.push(result);
    previousLoop = result;

    const loopDir = path.join(outputRoot, `loop-${loopNumber}`);
    const designDir = path.join(loopDir, 'design');
    await ensureDir(loopDir);
    await ensureDir(designDir);

    await writeJson(path.join(loopDir, 'summary.json'), result);

    for (const page of result.pages ?? []) {
      await writeJson(path.join(designDir, page.fileName), serializePage(page.canvasChildren ?? []));
    }
  }

  await writeJson(path.join(outputRoot, 'session.json'), {
    provider: provider.name,
    model: provider.model,
    loops: loopResults.map((loop, index) => ({
      loopNumber: index + 1,
      strategy: loop.strategy ?? null,
      whyThisExists: loop.whyThisExists ?? null,
      summary: loop.summary,
      changes: loop.changes,
      retained: loop.retained,
      risks: loop.risks
    }))
  });

  return {
    sessionDir: outputRoot,
    loops: loopResults.map((loop, index) => ({
      ...loop,
      loopDir: path.join(outputRoot, `loop-${index + 1}`),
      designDir: path.join(outputRoot, `loop-${index + 1}`, 'design')
    }))
  };
}
