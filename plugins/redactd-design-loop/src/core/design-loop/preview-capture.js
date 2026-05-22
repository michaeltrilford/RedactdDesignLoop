import path from 'node:path';
import { ensureDir, writeJson } from './fs-utils.js';

const PREVIEW_STORAGE_KEY = 'redactd-design-loop-preview-json';
const DEFAULT_PREVIEW_URL = 'https://redactd.xyz/design-loop-preview';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    try {
      return await import('@playwright/test');
    } catch {
      return null;
    }
  }
}

function resolvePreviewUrl(input = {}) {
  return (
    input.previewUrl ||
    process.env.REDACTD_DESIGN_LOOP_PREVIEW_URL ||
    DEFAULT_PREVIEW_URL
  );
}

function relativePreviewPath(parts) {
  return path.posix.join('previews', ...parts);
}

export function baselinePreviewPath(fileName) {
  return relativePreviewPath(['baseline', `${path.parse(fileName).name}.png`]);
}

export function loopPreviewPath(loopNumber, fileName) {
  return relativePreviewPath([
    `loop-${loopNumber}`,
    `${path.parse(fileName).name}.png`
  ]);
}

async function capturePage({ page, previewUrl, document, outputPath }) {
  await page.addInitScript(
    ([key, json]) => {
      window.localStorage.setItem(key, JSON.stringify(json));
    },
    [PREVIEW_STORAGE_KEY, document]
  );
  await page.goto(previewUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForFunction(
    () => document.documentElement.hasAttribute('data-design-loop-preview-ready'),
    { timeout: 30000 }
  );
  await page.screenshot({
    path: outputPath,
    fullPage: true,
    animations: 'disabled'
  });
}

export async function captureDesignPreviews({
  runRoot,
  previewUrl = DEFAULT_PREVIEW_URL,
  pages = []
}) {
  const statusPath = path.join(runRoot, 'previews', 'capture-status.json');
  const playwright = await loadPlaywright();

  if (!playwright?.chromium) {
    await ensureDir(path.dirname(statusPath));
    await writeJson(statusPath, {
      state: 'skipped',
      reason: 'Playwright is not available in this plugin runtime.',
      previewUrl,
      captured: []
    });
    return { captured: [], skipped: true };
  }

  const captured = [];
  const failures = [];
  let browser = null;

  try {
    browser = await playwright.chromium.launch({ headless: true });
  } catch (primaryError) {
    try {
      browser = await playwright.chromium.launch({
        channel: process.env.REDACTD_DESIGN_LOOP_BROWSER_CHANNEL || 'chrome',
        headless: true
      });
    } catch (fallbackError) {
      await ensureDir(path.dirname(statusPath));
      await writeJson(statusPath, {
        state: 'skipped',
        reason: 'No Playwright-compatible browser is available.',
        previewUrl,
        captured: [],
        errors: [
          primaryError instanceof Error ? primaryError.message : String(primaryError),
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        ]
      });
      return { captured: [], skipped: true };
    }
  }

  try {
    for (const item of pages) {
      const outputPath = path.join(runRoot, item.previewPath);
      await ensureDir(path.dirname(outputPath));
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1200 },
        deviceScaleFactor: 1
      });
      try {
        await capturePage({
          page,
          previewUrl,
          document: item.document,
          outputPath
        });
        captured.push(item.previewPath);
      } catch (error) {
        failures.push({
          previewPath: item.previewPath,
          error: error instanceof Error ? error.message : String(error)
        });
      } finally {
        await page.close().catch(() => {});
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  await ensureDir(path.dirname(statusPath));
  await writeJson(statusPath, {
    state: failures.length > 0 ? 'partial' : 'completed',
    previewUrl,
    captured,
    failures
  });

  return { captured, failures, skipped: false };
}

export function shouldCapturePreviews(input = {}) {
  if (input.capturePreviews === false) return false;
  if (process.env.REDACTD_DESIGN_LOOP_CAPTURE_PREVIEWS === 'false') return false;
  return true;
}

export { resolvePreviewUrl };
