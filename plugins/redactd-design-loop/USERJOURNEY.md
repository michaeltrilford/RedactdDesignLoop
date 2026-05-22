# Redactd Design Loop User Journey

## Install

The user installs the Redactd Design Loop plugin in Codex.

## Run

1. User attaches a Redactd JSON artifact.
2. User types `loop`.
3. Codex invokes `run_design_loop_all`.
4. The plugin prepares a local run folder and returns context.
5. Codex reviews the artifact using packaged personas.
6. Codex writes critique and iteration artifacts with `write_loop_artifacts`.
7. Codex optionally saves the strongest result with `save_design_loop_output`.

## Output

The user receives a short response containing:

- run folder path
- docs link
- recommended loop number when available

## Success Criteria

- The user does not need to operate the standalone CLI.
- The plugin does not depend on a sibling `RedactdCLI` checkout.
- Persona reports are specific, not duplicated with renamed personas.
- Iterations are meaningfully different and remain valid Redactd JSON.
