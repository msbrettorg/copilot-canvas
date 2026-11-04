# Copilot canvas apps

This repository stores the source for local GitHub Copilot canvas apps. The build and publish scripts use only Node.js built-ins.

## Requirements

- Node.js 18 or later
- The Copilot extension host for runtime SDK support

No package install is required. The Copilot SDK is supplied by the extension host.

## App structure

Put each app in `apps/<app-name>`. Each app must contain `extension.mjs`.

Do not commit runtime data, mailbox data, chat data, secrets, or `artifacts/state.json`. The build excludes the app's `artifacts` directory.

## Build

Build all apps:

```sh
npm run build
```

Build one app:

```sh
npm run build -- triage-inbox
```

Clean output is written to `dist/<app-name>`.

## Publish

Publish one built app:

```sh
npm run publish -- triage-inbox
```

Publish all built apps:

```sh
npm run publish:all
```

The default target is `~/.copilot/extensions`. Set `COPILOT_EXTENSIONS_DIR` to use another absolute path:

```sh
COPILOT_EXTENSIONS_DIR="$HOME/custom-extensions" npm run publish -- triage-inbox
```

Publish updates app files and removes stale non-runtime files. It always preserves the target app's `artifacts` directory.

## Check

Run the small behavior and source checks:

```sh
npm run check
npm test
```
