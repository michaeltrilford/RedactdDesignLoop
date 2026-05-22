# Redactd Design Loop

The official Redactd Design Loop plugin for Codex.

Run Redactd Design Loop on Redactd JSON artifacts from Codex, generate critique and iteration outputs, and import the results back into Redactd.

## Install In Codex

In Codex, open **Plugins**, then add this GitHub marketplace:

```text
Source: michaeltrilford/redactd-design-loop
Git ref: main
Sparse paths:
.agents/plugins
plugins/redactd-design-loop
```

After the marketplace is added, install **Redactd Design Loop** from the plugin list.

## Usage

Attach or select a Redactd JSON artifact in Codex, then ask:

```text
Run Design Loop on this Redactd JSON.
```

You can also specify the review scope and iteration count:

```text
Run Design Loop with all personas and 4 loops.
Run Design Loop with users only and 2 loops.
Run one focused user review loop.
```

## Outputs

The plugin writes a `design-loop-run/` folder into your selected workspace. It includes:

- critique reports
- iteration loop JSON files
- preview images when available
- selected final output

Drag the `design-loop-run/` folder into [Redactd Design Loop](https://redactd.xyz/design-loop) to review the dashboard, or drag individual `iteration/loop-x/design/*.json` files into the Redactd editor canvas.

## Links

- Redactd Design Loop: https://redactd.xyz/design-loop
- Redactd: https://redactd.xyz

