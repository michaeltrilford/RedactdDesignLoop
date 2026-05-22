import path from 'node:path';
import { writeJson } from './fs-utils.js';

function toPosixRelative(fromPath, targetPath) {
  return path.relative(fromPath, targetPath).split(path.sep).join('/');
}

export async function writeRunManifest({
  projectPath,
  runRoot,
  mode,
  contextPath = null,
  statusPath = null,
  summaryPath = null,
  scoresPath = null,
  reportPaths = [],
  loopSummaryPaths = [],
  sessionPath = null,
  finalPath = null
}) {
  const basePath = runRoot;
  const manifest = {
    runId: path.basename(runRoot),
    mode,
    projectKey: path.basename(projectPath),
    timestamp: new Date().toISOString(),
    runRootPath: toPosixRelative(basePath, runRoot),
    contextPath: contextPath ? toPosixRelative(basePath, contextPath) : null,
    statusPath: statusPath ? toPosixRelative(basePath, statusPath) : null,
    summaryPath: summaryPath ? toPosixRelative(basePath, summaryPath) : null,
    scoresPath: scoresPath ? toPosixRelative(basePath, scoresPath) : null,
    reportPaths: reportPaths.map((reportPath) => toPosixRelative(basePath, reportPath)),
    loopSummaryPaths: loopSummaryPaths.map((loopSummaryPath) =>
      toPosixRelative(basePath, loopSummaryPath)
    ),
    sessionPath: sessionPath ? toPosixRelative(basePath, sessionPath) : null,
    finalPath: finalPath ? toPosixRelative(basePath, finalPath) : null
  };

  const manifestPath = path.join(runRoot, 'run-manifest.json');
  await writeJson(manifestPath, manifest);
  return manifestPath;
}
