# Upstream references

This project intentionally targets OpenCode v2 and should be reviewed when the v2 plugin API changes.

Primary references used for the initial scaffold:

- OpenCode v2 plugin overview: https://opencode.ai/v2/docs/build/plugins
- OpenCode v2 plugin configuration: https://opencode.ai/v2/docs/plugins
- OpenCode v1 → v2 plugin migration: https://opencode.ai/v2/docs/build/plugins/migrate-v1
- `@opencode/plugin` package: https://www.npmjs.com/package/@opencode/plugin
- Optional YAML hook adapter: https://github.com/KristjanPikhof/OpenCode-Hooks

## Compatibility note

OpenCode v2 changed plugin entrypoints and event/hook APIs. Do not assume a v1 plugin that registers successfully is actually receiving v2 events. The native bridge therefore uses `Plugin.define`, domain transforms/hooks and `ctx.event.subscribe` from the v2 API. The YAML hook integration remains optional and must be validated against the exact deployed OpenCode and `opencode-yaml-hooks` versions.
