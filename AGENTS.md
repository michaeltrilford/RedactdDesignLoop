# AGENTS.md - Redactd Design Loop

If the user says something is wrong, give a short sense check before editing.

## Plugin Update Rule

This repo contains a Codex plugin installed from the local marketplace at `.agents/plugins/marketplace.json`. Codex runs from an installed cache copy, not directly from the plugin source folder.

Note: if `codex plugin list` shows this marketplace coming from `~/.codex/.tmp/marketplaces`, re-add the repo-local marketplace before trusting a reinstall from source. The installed cache must be checked against this repo, not a temp marketplace copy.

When changing anything under the plugin source that affects plugin behavior, skills, bundled assets, MCP tools, component knowledge, personas, or plugin metadata:

1. Bump the plugin cachebuster.
2. Keep the plugin package version aligned with the `.codex-plugin/plugin.json` version when a package file exists.
3. Reinstall with `codex plugin add redactd-design-loop@redactd-design-loop`.
4. Verify the plugin source matches the installed cache with `diff -rq`.
5. Tell the user to start a fresh Codex thread. If MCP/tool paths still look stale, tell them to restart Codex Desktop.

Prefer running this from the plugin root:

```bash
npm run refresh:plugin
```

Do not assume editing source files means Codex is using them. Always check the installed cache when the user asks whether the plugin is stale or current.
