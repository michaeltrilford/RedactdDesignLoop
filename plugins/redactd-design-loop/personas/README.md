# Redactd CLI Personas

These starter personas are the initial evaluation library for Redactd CLI.

They are split into two groups:

- `users`: synthetic end users moving through saved UI flows
- `stakeholders`: internal review hats that evaluate the same flows from a product, delivery, accessibility, trust, or systems perspective

## Why both exist

User personas help simulate likely end-user behavior.

Stakeholder personas are not replacements for user testing.

They are structured review hats that let the CLI examine the same flow through different internal lenses.

This repo uses the term "stakeholder hats" for those internal lenses.

If you later want to brand them as "fakeholders", that can sit on top of the same underlying structure.

## Recommended Phase 1 usage

- default user runs: 6 to 8 personas
- optional stakeholder runs: 4 to 6 hats
- compare results separately before mixing them into one summary

## Current Starter Set

Users:

- `cost-conscious-impatient.md`
- `busy-mobile-parent.md`
- `careful-first-time-user.md`
- `power-user-operator.md`
- `access-needs-screen-reader.md`
- `skeptical-security-buyer.md`
- `time-poor-manager.md`
- `international-non-native-reader.md`

Stakeholder hats:

- `product-manager-hat.md`
- `ux-researcher-hat.md`
- `accessibility-hat.md`
- `design-system-hat.md`
- `trust-and-safety-hat.md`
- `engineering-delivery-hat.md`

## Format

Each persona file follows a lightweight markdown structure:

- name
- type
- role
- context
- traits
- goals
- behavior
- focus
- avoids
- success criteria

This is intentionally simple so the CLI can parse it reliably in phase 1.
