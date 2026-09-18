# Licensing

## Project license

gasclaw is licensed under the [MIT License](LICENSE).
Copyright (c) 2026 Gabriel Sorrentino.

MIT lets you use, modify, and redistribute gasclaw — including commercially —
as long as the copyright notice and the permission notice travel with the
software. It comes with no warranty. The [LICENSE](LICENSE) file is the
authoritative text; this page is only a guide.

> Until 2026-09-18 the project was licensed under Apache-2.0. The change to MIT
> is recorded in [ADR-030](docs/adr/030-licenca-mit.md). Every line of the
> project is original work by the copyright holder: there are no vendored
> third-party sources and no production dependencies, so the relicensing
> required no third-party consent.

### Applying the license to files

Source files do not need a per-file header. If you prefer one, use the SPDX
identifier:

```ts
// SPDX-License-Identifier: MIT
```

## Contributions

Inbound = outbound: by opening a pull request you agree that your contribution
is licensed under the MIT License, the same terms as the project. There is no
CLA to sign.

## Dependencies

gasclaw ships **zero production dependencies**. The runtime is the Google Apps
Script platform itself, and `dist/_motor.js` is built only from this
repository's own sources — nothing from `node_modules` is bundled into what
gets deployed.

Development dependencies (TypeScript, esbuild, vitest, clasp) are used on the
build machine and never redistributed. Their licenses apply to them, not to
gasclaw's output.

## Trademarks

Google, Google Workspace, Google Apps Script, Google Drive, Gmail, Google
Calendar, Google Chat, Google Docs, Google Sheets, and Google Tasks are
trademarks of Google LLC. gasclaw is an independent project and is not
affiliated with, endorsed by, or sponsored by Google.

The MIT License grants no trademark rights. The name "gasclaw" and its
wordmark may be used to refer to this project; do not use them in a way that
suggests endorsement of a fork or a derived product.
