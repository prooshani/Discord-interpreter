<img width="1024" height="1024" alt="DI logo" src="https://github.com/user-attachments/assets/49a0f286-8ff7-4eda-9fd3-ad365bc385e8" />

# Discord Interpreter

Discord Interpreter is a desktop wrapper around Discord Web that adds local, private message translation overlays for multilingual teams.

It is designed for workplace usage where some channel messages are not in your preferred language, while keeping Discord chat behavior unchanged.

## Features

- Native desktop app experience via Electron (macOS and Windows).
- Configurable detection rules (for example `DE only` or `Non-EN`).
- Multi-destination translations (show one message in multiple target languages).
- Provider support:
  - Local OpenAI-compatible LLMs (LM Studio, Ollama, vLLM, OpenWebUI backends)
  - OpenAI
  - DeepL
  - Google Translate
  - Azure Translator
  - LibreTranslate
- Provider connectivity test directly in Settings.
- Translation cache for reduced repeated API usage.
- Optional diagnostics/debug visibility and local log viewer.

## Compliance and Safety Notes

- This app does **not** post, edit, or automate messages in Discord.
- It does **not** use Discord private APIs or self-bot behavior.
- It runs as a browser-style client with local overlay rendering.
- You are responsible for using it under your organization policy and Discord Terms.

Discord can change frontend DOM structure at any time. If overlays stop appearing, selector updates may be needed in preload code.

## Tech Stack

- Electron
- TypeScript
- HTML/CSS renderer UI

## Project Structure

```text
src/main/        Main process, IPC, providers, logging
src/preload/     Discord DOM scanning and overlay injection
src/renderer/    Settings UI
scripts/         Build helper scripts
dist/            TypeScript build output
release/         Installer artifacts
```

## Requirements

- Node.js 20+ (recommended)
- npm 10+

## Local Development

```bash
npm install
npm run dev
```

## Build Installers

```bash
npm run dist:mac
npm run dist:win
```

Installer artifacts are written to `release/`.

## Provider Setup

Open Settings with `Cmd/Ctrl + ,`:

1. Select detection mode and destination languages.
2. Select translation provider.
3. Enter credentials (if required).
4. Use **Test provider** to verify connectivity.
5. Save settings.

## Troubleshooting

- **No translation shown:** check detection mode, destination languages, and minimum message length.
- **Local LLM empty output:** use a non-reasoning translation model and disable Think mode in your local runtime.
- **Provider fetch failure:** verify endpoint URL, firewall/public network access, and credentials.
- **DOM overlay stops after Discord update:** update selectors in preload logic.

## Contributing

Contributions are welcome via pull requests. Please keep changes focused, tested, and aligned with the existing architecture.

## License

MIT License. See [LICENSE](LICENSE).
