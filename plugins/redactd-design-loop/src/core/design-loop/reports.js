import path from 'node:path';
import { writeText } from './fs-utils.js';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderList(items) {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function dashboardHtml({ project, reports, summary, scores }) {
  const reportCards = reports
    .map(
      (report) => `
        <section class="card">
          <h2>${escapeHtml(report.persona.name)}</h2>
          <p class="meta">${escapeHtml(report.persona.type)} · ${escapeHtml(report.persona.role)}</p>
          <p>CSAT: <strong>${escapeHtml(report.csat)}</strong></p>
          <p>Friction: <strong>${escapeHtml(report.frictionScore)}</strong></p>
          <p>Clarity: <strong>${escapeHtml(report.clarityScore)}</strong></p>
          <h3>Friction</h3>
          ${renderList(report.frictionPoints)}
          <h3>Confusion</h3>
          ${renderList(report.confusionPoints)}
          <h3>Recommendations</h3>
          ${renderList(report.recommendations)}
        </section>
      `
    )
    .join('\n');

  const pageRows = summary.pages
    .map(
      (page) => `
        <tr>
          <td>${escapeHtml(page.fileName)}</td>
          <td>${escapeHtml(page.totalNodes)}</td>
          <td>${escapeHtml(Object.keys(page.componentCounts).length)}</td>
        </tr>
      `
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Loop Critique</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; background: #0f1115; color: #f3f4f6; }
    main { max-width: 1100px; margin: 0 auto; padding: 32px 20px 60px; }
    .hero { margin-bottom: 28px; }
    .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 28px; }
    .stat, .card { background: #171a21; border: 1px solid #262b36; border-radius: 12px; padding: 16px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
    .meta { color: #9ca3af; }
    table { width: 100%; border-collapse: collapse; background: #171a21; border: 1px solid #262b36; border-radius: 12px; overflow: hidden; }
    th, td { padding: 12px 14px; border-bottom: 1px solid #262b36; text-align: left; }
    h1, h2, h3, p { margin-top: 0; }
    ul { margin: 0; padding-left: 18px; }
  </style>
</head>
<body>
  <main>
    <div class="hero">
      <h1>Loop Critique</h1>
      <p class="meta">${escapeHtml(project.projectPath)}</p>
    </div>
    <div class="stats">
      <div class="stat"><div class="meta">Average CSAT</div><div>${escapeHtml(scores.averageCsat)}</div></div>
      <div class="stat"><div class="meta">Success Rate</div><div>${escapeHtml(scores.successRate)}</div></div>
      <div class="stat"><div class="meta">Pages</div><div>${escapeHtml(summary.pages.length)}</div></div>
      <div class="stat"><div class="meta">Personas</div><div>${escapeHtml(reports.length)}</div></div>
    </div>
    <section>
      <h2>Pages</h2>
      <table>
        <thead><tr><th>File</th><th>Nodes</th><th>Types</th></tr></thead>
        <tbody>${pageRows}</tbody>
      </table>
    </section>
    <section style="margin-top: 28px;">
      <h2>Persona Reports</h2>
      <div class="grid">${reportCards}</div>
    </section>
  </main>
</body>
</html>`;
}

export async function writeCritiqueDashboard({ project, reports, summary, scores, critiqueDir }) {
  await writeText(path.join(critiqueDir, 'index.html'), dashboardHtml({ project, reports, summary, scores }));
}
