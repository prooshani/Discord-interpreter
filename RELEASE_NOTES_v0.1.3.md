# Discord Interpreter v0.1.3 (Initial Public Release)

Discord Interpreter is a native-feeling desktop wrapper for Discord Web with in-context translation overlays, Windows notifications, and built-in updater support.

## Highlights

- Native-feeling Discord desktop wrapper with secure Electron defaults.
- Automatic translation overlays for incoming messages with configurable target languages.
- Windows 11 native toast notifications for new messages.
- Help menu tools:
  - About dialog with runtime/build details.
  - Test Notification action for quick diagnostics.
  - Check for Updates and Install Downloaded Update actions.
- Branded Windows installer/uninstaller with updated app icon.
- NSIS installer improvements for upgrade scenarios and settings retention.
- Differential update metadata generation (`.blockmap` + `latest.yml`) for binary-delta capable update delivery.

## Packaging and Update Notes

- Version: `0.1.3`
- Windows installer artifact: `Discord Interpreter Setup 0.1.3-x64.exe`
- Required release assets for updater:
  - `Discord Interpreter Setup 0.1.3-x64.exe`
  - `Discord Interpreter Setup 0.1.3-x64.exe.blockmap`
  - `latest.yml`

## Known Requirements

- In-app update checks require a published GitHub Release with the assets above.
- For best notification behavior on Windows, run the installed packaged build from Start menu shortcut.
