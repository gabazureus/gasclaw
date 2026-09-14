# Licensing

## Project license

gasclaw is licensed under the [Apache License, Version 2.0](LICENSE).
Copyright 2026 Gabriel Sorrentino. Attribution notices that must travel with
redistributions are in [NOTICE](NOTICE).

In short, Apache-2.0 lets you use, modify, and redistribute gasclaw, including
commercially, as long as you keep the license and notices, state significant
changes, and accept that the software comes without warranty. It also includes
an explicit patent grant from contributors. The [LICENSE](LICENSE) file is the
authoritative text; this page is only a guide.

### Applying the license to files

New source files should start with an SPDX identifier:

```ts
// SPDX-License-Identifier: Apache-2.0
```

For HTML files use `<!-- SPDX-License-Identifier: Apache-2.0 -->`, and for shell
scripts `# SPDX-License-Identifier: Apache-2.0` (after the shebang line).

Existing files do not carry the header yet. The repository-level
[LICENSE](LICENSE) applies to every file regardless; adding headers to existing
files can be done in a dedicated change.

## Contributions (inbound = outbound)

Contributions are accepted under the same license as the project: anything you
submit is licensed to everyone under Apache-2.0 (section 5 of the license). There
is no separate CLA.

To certify that you have the right to submit your work, every commit must carry
a [Developer Certificate of Origin](https://developercertificate.org/) (DCO 1.1)
sign-off:

```bash
git commit -s -m "feat(workspace): ..."
```

This appends a `Signed-off-by: Your Name <you@example.com>` trailer. Use your
real name and an e-mail address you can be reached at. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.

## Dependency licenses

gasclaw has no runtime `dependencies` in `package.json`. The direct
`devDependencies` below are used only to type-check, build, test, and deploy;
the bundle published to Apps Script is built from the project's own `src/`.
Versions and licenses come from each package's `node_modules/<dep>/package.json`.

| Package | Version | License | Used for |
|---|---|---|---|
| `@google/clasp` | 3.4.1 | Apache-2.0 | Pushing and deploying to Apps Script |
| `@types/google-apps-script` | 2.0.13 | MIT | Apps Script type definitions |
| `@types/node` | 24.13.4 | MIT | Node.js type definitions (build and tests) |
| `esbuild` | 0.28.2 | MIT | Bundling TypeScript into a single Apps Script file |
| `typescript` | 7.0.2 | Apache-2.0 | Type checking |
| `vitest` | 5.0.0 | MIT | Test runner |

Transitive dependencies have their own licenses; inspect them in
`node_modules/` or with a license-checking tool before redistributing a build
environment.

## Third-party trademarks

Google, Google Workspace, Google Apps Script, Google Drive, Google Chat, and
Google Cloud are trademarks of Google LLC. OpenRouter is a trademark of its
respective owner. Other names may be trademarks of their owners.

gasclaw is an independent project. It is not affiliated with, endorsed by, or
sponsored by Google or OpenRouter. These names are used only to describe what
gasclaw works with.

## Your agents and your data

An agent is a Google Drive folder containing markdown files you write (for
example `AGENTS.md`, `SOUL.md`, `IDENTITY.md`, `USER.md`). That content belongs
to you. It is not part of gasclaw and is not covered by gasclaw's license; the
templates gasclaw creates in your folder become yours to edit and license as you
wish.

Conversations and model responses are processed by your own Google account and
by the model provider you select through OpenRouter, under their respective
terms.
