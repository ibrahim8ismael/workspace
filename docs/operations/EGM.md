# Elephant-Goldfish Model

EGM is installed as a project-local Codex plugin for planning, specification
review and documentation checks. It is development tooling, not an application
runtime dependency.

## Source and installation

- Repository: https://github.com/google/elephant-goldfish-model
- Upstream version: `0.1.1`
- Pinned commit: `e9e1f06aa4e26e95cd4ed37210a0632202c429e9`
- Runtime: `plugins/egm/`, generated using upstream `scripts/pack_plugin.py`
  with target `openai`. Skills, reviewer personas, standards, host documentation,
  manifests, artwork and Apache-2.0 license are preserved together.
- Marketplace: `.agents/plugins/marketplace.json`, named `gather-space`.
- Project configuration: `.codex/config.toml` enables `egm@gather-space`.

Restart the desktop app and open a new chat in this trusted project so it can
refresh the project marketplace and load the installed skills. If the client
requires an explicit install, select EGM from the project's Plugins list or run
`codex plugin add egm@gather-space` from the repository root.

## Usage

Select an installed EGM skill from the skill picker:

- `egm-bootstrap`: document an existing codebase.
- `egm-drift-report`: compare documentation with implementation.
- `egm-brainstorm`: explore requirements and trade-offs.
- `egm-draft`: draft a software specification.
- `egm-review`: review a design using fresh-context reviewers.
- `egm-review-loop`: run a configured review task.
- `egm-resolve`: work through review findings.

For Gather Lite, use the current project brief and existing plans as the
architecture baseline. Keep actual implementation evidence separate from plans.
EGM reviews require fresh subagents; installation alone does not verify review
isolation or end-to-end workflows. See `plugins/egm/docs/codex.md`.

## Updates

Choose a new upstream commit explicitly, rebuild the OpenAI runtime with the
upstream packager, replace `plugins/egm/`, update this pin and verify bundled
files against the generated runtime. Preserve the upstream files verbatim.
Refresh the desktop app after updating.
