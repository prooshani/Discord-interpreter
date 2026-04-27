import { app } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { InterpreterSettings } from "../shared/types.js";

export const defaultSettings: InterpreterSettings = {
  enabled: true,
  detectionMode: "de",
  targetLanguage: "en",
  targetLanguages: ["en"],
  displayMode: "below",
  provider: "mock",
  openaiApiKey: "",
  openaiModel: "gpt-5-mini",
  deeplApiKey: "",
  googleApiKey: "",
  azureApiKey: "",
  azureRegion: "",
  azureEndpoint: "https://api.cognitive.microsofttranslator.com",
  libreBaseUrl: "http://localhost:5000",
  libreApiKey: "",
  localBaseUrl: "http://localhost:11434/v1",
  localApiKey: "",
  localModel: "llama3.1",
  minCharacters: 8,
  debounceMs: 350,
  keepOriginalVisible: true,
  debugOverlayEnabled: true,
  translateBacklogLimit: 30,
  visibleOnly: true,
  loggingEnabled: true
};

const settingsPath = () => join(app.getPath("userData"), "settings.json");

export async function loadSettings(): Promise<InterpreterSettings> {
  try {
    const raw = await readFile(settingsPath(), "utf8");
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    return defaultSettings;
  }
}

export async function saveSettings(settings: InterpreterSettings): Promise<InterpreterSettings> {
  const next = { ...defaultSettings, ...settings };
  await mkdir(dirname(settingsPath()), { recursive: true });
  await writeFile(settingsPath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}
