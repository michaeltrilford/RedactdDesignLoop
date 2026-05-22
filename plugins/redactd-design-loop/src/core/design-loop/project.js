import path from 'node:path';
import { listFilesRecursive, readJson } from './fs-utils.js';

function normalizeRawTree(filePath, value) {
  if (typeof value.type !== 'string') {
    throw new Error(`Invalid page JSON in ${filePath}: expected component tree with type`);
  }

  return {
    filePath,
    fileName: path.basename(filePath),
    canvasChildren: [value],
    rootNode: value
  };
}

function validateRootShape(filePath, value) {
  if (!value || typeof value !== 'object') {
    throw new Error(`Invalid page JSON in ${filePath}: expected object`);
  }

  if (value.type !== 'Root' || !Array.isArray(value.children)) {
    return normalizeRawTree(filePath, value);
  }

  const canvasNode = value.children.find((child) => child && child.type === '_Canvas');
  if (!canvasNode || !Array.isArray(canvasNode.children)) {
    return normalizeRawTree(filePath, value);
  }

  return {
    filePath,
    fileName: path.basename(filePath),
    canvasChildren: canvasNode.children,
    rootNode:
      canvasNode.children.length === 1
        ? canvasNode.children[0]
        : {
            id: `${path.basename(filePath, path.extname(filePath))}::canvas-group`,
            type: 'CanvasGroup',
            props: {},
            children: canvasNode.children
          }
  };
}

function collectNodes(node, acc = []) {
  if (!node || typeof node !== 'object') return acc;
  acc.push(node);
  for (const child of node.children ?? []) {
    collectNodes(child, acc);
  }
  return acc;
}

function summarizePage(page) {
  const nodes = collectNodes(page.rootNode);
  const componentCounts = {};

  for (const node of nodes) {
    componentCounts[node.type] = (componentCounts[node.type] ?? 0) + 1;
  }

  return {
    ...page,
    totalNodes: nodes.length,
    componentCounts
  };
}

export async function loadProject(projectPath) {
  const candidateFiles = (await listFilesRecursive(projectPath)).filter((filePath) =>
    filePath.endsWith('.json')
  );
  const pages = [];

  for (const filePath of candidateFiles) {
    try {
      const parsed = await readJson(filePath);
      pages.push(summarizePage(validateRootShape(filePath, parsed)));
    } catch {
      // Ignore non-page JSON artifacts.
    }
  }

  if (pages.length === 0) {
    throw new Error(`No valid Redactd page JSON files found in ${projectPath}`);
  }

  return {
    projectPath,
    pages
  };
}
