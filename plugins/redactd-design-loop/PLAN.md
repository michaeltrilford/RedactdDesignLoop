# Redactd Design Loop Plugin Plan

## Goal

Package Redactd Design Loop as an official Codex plugin.

The plugin should let a user attach a Redactd JSON artifact, type `loop`, and have Codex run a structured critique and iteration workflow without asking the user to operate the standalone CLI directly.

## Current Scope

- Codex plugin manifest in `.codex-plugin/plugin.json`
- MCP server exposed through `.mcp.json`
- Loop skill in `skills/loop/SKILL.md`
- Packaged personas in `personas/`
- Local smoke test through `npm run test:plugin`

## Product Boundary

This plugin is for Design Loop. It is not the source-link extraction plugin.

Design Loop responsibilities:

- read Redactd JSON artifacts
- prepare a local run folder
- load user and stakeholder personas
- ask Codex to produce critique and iterations
- persist structured reports, scores, loops, and optional final JSON

Out of scope for this plugin:

- extracting arbitrary websites into Redactd JSON
- pretending local heuristics are equivalent to model review
- replacing the Redactd web app

## Release Checklist

- validate plugin manifest
- smoke test MCP tools
- confirm plugin assets render in Codex
- confirm packaged personas work without a sibling `RedactdCLI` checkout
- confirm run outputs are ignored from distribution
- decide final marketplace/repository publishing path
