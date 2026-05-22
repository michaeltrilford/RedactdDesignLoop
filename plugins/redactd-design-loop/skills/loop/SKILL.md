---
name: loop
description: Run Redactd Design Loop on an attached Redactd JSON artifact by reviewing the UI in Codex, writing critique and iteration artifacts, and saving the strongest output.
---

# Loop

Use this skill when the user says `loop`, `Loop`, or asks to run Redactd Design Loop on a Redactd JSON artifact.

## Workflow

1. Call `run_design_loop_all` with the attached artifact path, project path, or inline Redactd pages. In Codex, this may appear as the namespaced MCP tool `mcp__redactd_design_loop__run_design_loop_all`.
2. Read the prepared run context from the returned `contextPath`.
3. Review the artifact as Codex using the packaged persona context.
4. Produce structured critique scores, persona reports, and differentiated iteration loops.
5. Call `write_loop_artifacts` with the critique and iteration payload. In Codex, this may appear as `mcp__redactd_design_loop__write_loop_artifacts`.
6. If a strongest result is selected, call `save_design_loop_output`. In Codex, this may appear as `mcp__redactd_design_loop__save_design_loop_output`.
7. Reply briefly with the run folder, docs link, and recommended loop number when available.

## Defaults

- Review path: `all`
- Exploration depth: `4` by default. Use `8` only when the user explicitly asks for exhaustive/crazy-eights exploration.
- Variation mode: `safe`
- Selected folder: if Codex is working in a selected project/workspace folder, pass that exact folder as `outputRoot` unless the user asks for another destination.
- Output: use the selected workspace folder by default. If no workspace is known, the plugin infers from `projectPath` or `artifactPath` and writes `Redactd-Design-Loop/<project>/` beside that source.
- Preview images: capture PNG previews by default when Playwright is available, using `https://redactd.xyz/design-loop-preview` unless `previewUrl` or `REDACTD_DESIGN_LOOP_PREVIEW_URL` is set. If capture is unavailable, continue the run and write `previews/capture-status.json`.
- Docs: `https://redactd.xyz/design-loop`

## Rules

- Use the exposed Design Loop MCP tools only. Do not inspect the plugin bundle, import local source files, create temporary runner scripts, use Node REPL fallbacks, or run shell-based fallback workflows.
- If neither the direct tool names nor the `mcp__redactd_design_loop__...` namespaced MCP tools are available, stop and tell the user: `Redactd Design Loop tools are not loaded in this Codex session. Refresh or reinstall the plugin, then start a new thread.`
- Do not use local heuristic critique or fake iteration output.
- Do not inject critique notes into the design JSON.
- Iterate only with component types present in the source artifact unless the source system clearly supports more.
- Make iteration loops meaningfully different.
- Keep reports compact: 1-2 friction points, 1 confusion point, and 1-2 recommendations per persona.
- Include report metrics on a 1-10 scale: `csat`, `frictionScore`, `clarityScore`, and `taskSuccess`. If you omit them, the plugin will synthesize metrics from the report findings.
- Keep iteration metadata compact: a short summary plus the minimum useful changes/retained/risks lists.
- Use the full persona shape from context: context, traits, goals, behavior, focus, avoids, and successCriteria.
- Every persona report must include at least one persona-specific concern and one persona-specific recommendation.
- Do not submit duplicated persona reports with different names.
- The saved persona reports are the source of truth.
- The critique summary should distinguish shared vs specific feedback using `consensusFindings`, `userOnlyFindings`, `stakeholderOnlyFindings`, and `outlierFindings`.
- Keep user-facing replies short.
