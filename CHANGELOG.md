# Changelog

All notable changes to Pentimento will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added - Stage 1 (project scaffolding)

- Initialized `pentimento` repository and VSCode extension project.
- `package.json` with full command contract (32 `pentimento.*` commands),
  full configuration contract, color contract (6 layers + overlap/modified/
  ambiguous), and an Activity Bar view container for `PENTIMENTO`.
- TypeScript + esbuild + ESLint (flat config) + Mocha + Chai +
  `@vscode/test-electron` toolchain.
- `README.md` and `README.zh-CN.md` with the "Why the name Pentimento?" /
  "为什么叫 Pentimento?" sections.
- `docs/TECHNICAL_DESIGN.md` (technical design, confirmed) and
  `docs/IMPLEMENTATION_STATUS.md` (progress tracker).
- Minimal `src/extension.ts` activation: Output Channel `Pentimento`,
  context keys, command stubs, and an empty Patches tree view.
- Minimal unit-test scaffolding.

### Notes

- No user-facing highlight functionality yet; commands are registered as
  placeholders. Implementation begins in Stage 2 (GitRunner).
