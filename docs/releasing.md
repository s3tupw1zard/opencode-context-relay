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

## Publish npm packages manually

Authenticate once:

```sh
npm login
```

Publish the OpenCode plugin:

```sh
cd packages/opencode-context-relay
npm run check
npm pack --dry-run
npm publish --access public --tag latest
```

Publish the standalone ChatGPT bridge:

```sh
cd ../../services/chatgpt-bridge
npm run typecheck
npm run lint
npm test
npm pack --dry-run
npm publish --access public --tag latest
```

The published npm packages are:

```text
opencode-context-relay
opencode-context-relay-chatgpt
```

The explicit `--tag latest` is intentional. Do not rely on npm deciding a different prerelease channel.

Verify:

```sh
npm view opencode-context-relay version
npm view opencode-context-relay dist-tags
npm view opencode-context-relay versions --json
npm view opencode-context-relay-chatgpt dist-tags
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

## Container images

Pushing a version tag such as:

```sh
git tag v2026.1.0-dev.7
git push origin v2026.1.0-dev.7
```

triggers `.github/workflows/release-images.yml` and publishes:

```text
ghcr.io/s3tupw1zard/opencode-context-relay-chatgpt:2026.1.0-dev.7
ghcr.io/s3tupw1zard/opencode-context-relay-chatgpt:latest

ghcr.io/s3tupw1zard/opencode-context-relay-migrator:2026.1.0-dev.7
ghcr.io/s3tupw1zard/opencode-context-relay-migrator:latest
```

The migrator image contains the exact SQL migrations and role definitions from that tag. It never downloads migration SQL from a moving branch at runtime.

After the first GHCR publication, ensure both packages are public in GitHub Packages if anonymous Docker pulls are desired.
