# Redactd Design Loop Codex Plugin

Official Codex plugin for running Redactd Design Loop against Redactd JSON artifacts.

The plugin packages the Design Loop workflow for Codex so a user can attach a Redactd JSON file, type `loop`, and get structured critique plus iteration artifacts without manually operating the CLI.

## What It Does

- accepts Redactd JSON artifacts from an attached file, project path, or inline pages
- prepares a local Design Loop run folder
- reviews the artifact through packaged user and stakeholder personas
- writes critique summaries, persona reports, scores, and iteration payloads
- saves selected final Redactd JSON for import back into Redactd

## Relationship To RedactdCLI

RedactdCLI remains the standalone local CLI product.

This Codex plugin intentionally packages its own copy of the Design Loop runtime under `src/core/design-loop` and its own persona library under `personas/`.

That duplication is deliberate for the first official plugin version:

- Codex plugins should be installable without relying on a sibling `../RedactdCLI` checkout
- plugin users should not need to understand or install the standalone CLI repo
- packaged personas make the plugin deterministic and portable
- the plugin can evolve its Codex-specific workflow without forcing changes into the standalone CLI

Long term, if the duplicated runtime becomes painful to maintain, the shared Design Loop core can be extracted into a dedicated package such as `@redactd/design-loop-core`. At that point both `RedactdCLI` and this Codex plugin can depend on the same core package while keeping their own product-specific entry points.

## Plugin Shape

```text
.codex-plugin/plugin.json   Codex plugin manifest
.mcp.json                   MCP server registration
skills/loop/SKILL.md        Codex workflow instructions
src/                        MCP server and Design Loop implementation
personas/                   Packaged user and stakeholder review personas
assets/                     Plugin listing assets
```

## Usage

Attach a Redactd JSON artifact in Codex and type one of:

```text
loop
Run Loop on this Redactd JSON.
Critique this artifact with users and stakeholders.
Create safer and bolder iterations of this UI.
```

## Run Outputs

Loop writes local run artifacts to the user's visible Documents folder by default:

```text
~/Documents/Redactd-Design-Loop/<project>/
C:\Users\<you>\Documents\Redactd-Design-Loop\<project>\
```

Pass `outputRoot` to choose a different destination.

These folders contain critique reports, iteration payloads, and saved final Redactd JSON. They are generated user output and should not be included in plugin distribution.

## Provider Setup

Loop needs a model provider unless running the smoke test with the mock provider. Configure one of:

```bash
OPENAI_API_KEY=...
GROQ_API_KEY=...
XAI_API_KEY=...
```

For local smoke testing, the plugin uses `REDACTD_DEV_PROVIDER=mock`.

## Local Validation

```bash
npm run test:plugin
npm run validate:plugin
```

## Notes

- This plugin is intentionally Codex-first. It does not ship fake heuristic critique as the product workflow.
- Personas are packaged inside this repo so the plugin does not depend on a sibling `RedactdCLI` checkout.
- Run outputs are local and should remain ignored from distribution.
