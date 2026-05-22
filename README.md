# Redactd Design Loop Marketplace

Local Codex marketplace for the official Redactd Design Loop plugin.

## Plugin

- `redactd-design-loop`
- Marketplace entry: `.agents/plugins/marketplace.json`
- Plugin root: `plugins/redactd-design-loop`

## Local Install

```bash
codex plugin marketplace add .
codex plugin add redactd-design-loop@redactd-official-local
```

## Release Notes

- Do not distribute generated `.redactd-runs*` folders.
- Do not distribute `.DS_Store` files.
- Keep the marketplace source path as `./plugins/redactd-design-loop`.
