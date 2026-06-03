# Redactd Design Loop

The official Redactd Design Loop plugin for Codex.

Run Redactd Design Loop on Redactd JSON artifacts from Codex, generate critique and iteration outputs, and import the results back into Redactd.

## Codex Plugin Setup

Redactd Design Loop is the official Codex plugin for running critique and iteration against Redactd JSON artifacts.

Until Codex has a simpler public plugin directory, install Redactd Design Loop by pointing Codex at the Redactd Design Loop GitHub repo.

Plugin source:
https://github.com/michaeltrilford/RedactdDesignLoop

![Codex Add Marketplace dialog](https://redactd.xyz/images/install-plugin.png)

## Manual Install Steps

1. Open Codex.
2. Go to **Plugins**.
3. Open **Built by OpenAI**.
4. Choose **+ Add more**.
5. Paste the values below.
6. Save the marketplace.
7. Find **Redactd Design Loop** in the plugin list.
8. Install or enable it.

## Add Marketplace Values

```text
Source: michaeltrilford/RedactdDesignLoop

Git ref:
main

Sparse paths:
.agents/plugins
plugins/redactd-design-loop
```

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
