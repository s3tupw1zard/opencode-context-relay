# Releasing

> The project is currently WIP and development releases are not production-stable.

## Version format

All components use the same SemVer-compatible calendar-aware version:

```text
YEAR.RELEASE.PATCH[-PRERELEASE]
```

Examples:

```text
2026.1.0-dev.7
2026.1.0-rc.1
2026.1.0
2026.1.1
2026.2.0-dev.1
2027.1.0-dev.1
```

## npm policy

During development, **the newest published build is always the npm `latest` dist-tag, including prereleases**.

That means OpenCode can stay configured with:

```sh
opencode plugin add opencode-context-relay@latest
```

and later:

```sh
opencode plugin update opencode-context-relay@latest
```

OpenCode v2 accepts npm versions, tags and ranges for package plugins.

## Publish manually

Authenticate once:

```sh
npm login
```

Then from the package directory:

```sh
cd packages/opencode-context-relay
npm run check
npm pack --dry-run
npm publish --access public --tag latest
```

The explicit `--tag latest` is intentional. Do not rely on npm deciding a different prerelease channel.

Verify:

```sh
npm view opencode-context-relay version
npm view opencode-context-relay dist-tags
npm view opencode-context-relay versions --json
```

For the current development release, `latest` should resolve to:

```text
2026.1.0-dev.7
```

## Release checklist

1. Update the root, OpenCode package, ChatGPT service and plugin manifest to the same version.
2. Run both GitHub Actions workflows.
3. Confirm the PostgreSQL migration set is forward-only; never edit an already released migration.
4. Back up a real deployment and test the upgrade path when the schema changed.
5. Publish the npm package with `--tag latest`.
6. Create the matching Git tag/release after the commit is final.
7. Keep the WIP warning until the project has enough real-world testing to claim stability.
