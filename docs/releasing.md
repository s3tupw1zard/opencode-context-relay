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

npm distribution tags follow the release channel:

```text
*-dev.N -> dev
*-rc.N  -> next
stable   -> latest
```

Examples:

```text
2026.1.0-dev.7 -> dev
2026.1.0-rc.1  -> next
2026.1.0       -> latest
```

Development releases must never overwrite `latest`.

Consumers can choose a channel explicitly:

```sh
opencode plugin add opencode-context-relay@dev
opencode plugin add opencode-context-relay@next
opencode plugin add opencode-context-relay@latest
```

OpenCode v2 accepts npm versions, tags and ranges for package plugins.

## Publish npm packages manually

Authenticate once:

```sh
npm login
```

Normal releases are published by `.github/workflows/publish.yml` through npm Trusted Publishing.

The workflow derives the npm dist-tag automatically from the Git version:

```text
dev prerelease -> dev
release candidate -> next
stable release -> latest
```

It publishes both packages from the same trusted workflow:

```text
opencode-context-relay
opencode-context-relay-chatgpt
```

Manual publishing should only be used for recovery and must use the same channel mapping.

The published npm packages are:

```text
opencode-context-relay
opencode-context-relay-chatgpt
```

Verify:

```sh
npm view opencode-context-relay version
npm view opencode-context-relay dist-tags
npm view opencode-context-relay versions --json
npm view opencode-context-relay-chatgpt dist-tags
```

For the current development release, `dev` should resolve to:

```text
2026.1.0-dev.7
```

`latest` is reserved for stable releases.

## Release checklist

1. Update the root, OpenCode package, ChatGPT service and plugin manifest to the same version.
2. Run both GitHub Actions workflows.
3. Confirm the PostgreSQL migration set is forward-only; never edit an already released migration.
4. Back up a real deployment and test the upgrade path when the schema changed.
5. Push the matching Git tag; `publish.yml` publishes both npm packages to `dev`, `next`, or `latest` according to the version.
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
ghcr.io/s3tupw1zard/opencode-context-relay-chatgpt:dev

ghcr.io/s3tupw1zard/opencode-context-relay-migrator:2026.1.0-dev.7
ghcr.io/s3tupw1zard/opencode-context-relay-migrator:dev
```

The migrator image contains the exact SQL migrations and role definitions from that tag. It never downloads migration SQL from a moving branch at runtime.

After the first GHCR publication, ensure both packages are public in GitHub Packages if anonymous Docker pulls are desired.
