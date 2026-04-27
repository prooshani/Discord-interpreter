import { app, BrowserWindow, ipcMain, Menu, nativeTheme, shell, session } from "electron";
import { join } from "node:path";
import { loadSettings, saveSettings } from "./settings-store.js";
import { appendLog, clearLog, readLog } from "./logging.js";
import { clearTranslationCache, translateText } from "./translation.js";
import type { AppStatus, InterpreterSettings, TranslationRequest } from "../shared/types.js";

let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let settingsCache: InterpreterSettings | null = null;

const discordOrigin = "https://discord.com";
const discordUrl = "https://discord.com/app";

app.setName("Discord-interpreter");
app.setAppUserModelId("Discord-interpreter");

function appRoot(...parts: string[]): string {
  return join(app.getAppPath(), ...parts);
}

async function getSettings(): Promise<InterpreterSettings> {
  if (!settingsCache) settingsCache = await loadSettings();
  return settingsCache;
}

function broadcastSettings(settings: InterpreterSettings): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("settings:changed", settings);
  }
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    title: "Discord Interpreter",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#101114" : "#f7f7f8",
    show: false,
    webPreferences: {
      preload: appRoot("dist/preload/discord-preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: true,
      webSecurity: true,
      partition: "persist:discord-interpreter"
    }
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.loadURL(discordUrl);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(discordOrigin)) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(discordOrigin)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.webContents.on("context-menu", (_event, params) => {
    const template: Electron.MenuItemConstructorOptions[] = [];
    if (params.isEditable) {
      if (params.misspelledWord && params.dictionarySuggestions.length > 0) {
        for (const suggestion of params.dictionarySuggestions.slice(0, 6)) {
          template.push({
            label: suggestion,
            click: () => mainWindow?.webContents.replaceMisspelling(suggestion)
          });
        }
        template.push({
          label: "Add to Dictionary",
          click: () => mainWindow?.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
        });
        template.push({ type: "separator" });
      }
      template.push(
        { role: "undo", enabled: params.editFlags.canUndo },
        { role: "redo", enabled: params.editFlags.canRedo },
        { type: "separator" },
        { role: "cut", enabled: params.editFlags.canCut },
        { role: "copy", enabled: params.editFlags.canCopy },
        { role: "paste", enabled: params.editFlags.canPaste },
        { role: "selectAll" }
      );
    } else {
      template.push(
        { role: "copy", enabled: params.editFlags.canCopy },
        { role: "selectAll" }
      );
    }
    Menu.buildFromTemplate(template).popup({ window: mainWindow ?? undefined });
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createSettingsWindow(): void {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 980,
    height: 860,
    minWidth: 860,
    minHeight: 720,
    title: "Interpreter Settings",
    parent: mainWindow ?? undefined,
    backgroundColor: "#111318",
    webPreferences: {
      preload: appRoot("dist/preload/settings-preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  settingsWindow.loadFile(appRoot("dist/renderer/settings.html"));
  settingsWindow.webContents.on("context-menu", (_event, params) => {
    const template: Electron.MenuItemConstructorOptions[] = [
      { role: "undo", enabled: params.editFlags.canUndo },
      { role: "redo", enabled: params.editFlags.canRedo },
      { type: "separator" },
      { role: "cut", enabled: params.editFlags.canCut },
      { role: "copy", enabled: params.editFlags.canCopy },
      { role: "paste", enabled: params.editFlags.canPaste },
      { type: "separator" },
      { role: "selectAll" }
    ];
    Menu.buildFromTemplate(template).popup({ window: settingsWindow ?? undefined });
  });
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

function buildMenu(): void {
  const loggingEnabled = settingsCache?.loggingEnabled ?? true;
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "Discord Interpreter",
      submenu: [
        { label: "Settings", accelerator: "CmdOrCtrl+,", click: () => createSettingsWindow() },
        { label: "Error Logs", click: () => createSettingsWindow() },
        {
          label: "Keep Error Logs",
          type: "checkbox",
          checked: loggingEnabled,
          click: async (item) => {
            const current = await getSettings();
            settingsCache = await saveSettings({ ...current, loggingEnabled: item.checked });
            broadcastSettings(settingsCache);
            buildMenu();
          }
        },
        { type: "separator" },
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "quit" }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  settingsCache = await loadSettings();

  const discordSession = session.fromPartition("persist:discord-interpreter");
  discordSession.setPermissionCheckHandler((_webContents, permission) => {
    if (permission === "notifications") return true;
    if (permission === "clipboard-read") return true;
    return false;
  });
  discordSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "notifications" || permission === "clipboard-read");
  });

  buildMenu();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("settings:get", async () => getSettings());

ipcMain.handle("settings:save", async (_event, settings: InterpreterSettings) => {
  settingsCache = await saveSettings(settings);
  broadcastSettings(settingsCache);
  buildMenu();
  return settingsCache;
});

ipcMain.handle("settings:enabled", async (_event, enabled: boolean) => {
  const current = await getSettings();
  settingsCache = await saveSettings({ ...current, enabled });
  broadcastSettings(settingsCache);
  return settingsCache;
});

ipcMain.handle("settings:open", async () => {
  createSettingsWindow();
});

ipcMain.handle("settings:close", async () => {
  settingsWindow?.close();
});

ipcMain.handle("translate", async (_event, request: TranslationRequest) => {
  const settings = await getSettings();
  try {
    return await translateText(settings, request);
  } catch (error) {
    await appendLog(settings, "Runtime translation failed", error instanceof Error ? error.message : error);
    throw error;
  }
});

ipcMain.handle("translate:test", async (_event, settings: InterpreterSettings, request: TranslationRequest) => {
  try {
    return await translateText(settings, { ...request, bypassCache: true });
  } catch (error) {
    await appendLog(settings, "Provider test failed", error instanceof Error ? error.message : error);
    throw error;
  }
});

ipcMain.handle("local:models", async (_event, settings: InterpreterSettings) => {
  const baseUrl = settings.localBaseUrl?.replace(/\/$/, "");
  if (!baseUrl) throw new Error("Local LLM base URL missing.");
  const headers: Record<string, string> = {};
  if (settings.localApiKey) headers.Authorization = `Bearer ${settings.localApiKey}`;
  const response = await fetch(`${baseUrl}/models`, { headers });
  if (!response.ok) throw new Error(`Model list failed: HTTP ${response.status}`);
  const data = await response.json() as { data?: Array<{ id?: string }> };
  return (data.data ?? []).map((model) => model.id).filter((id): id is string => Boolean(id));
});

ipcMain.handle("logs:get", async () => readLog());

ipcMain.handle("logs:clear", async () => {
  await clearLog();
});

ipcMain.handle("cache:clear", async () => {
  return clearTranslationCache();
});

ipcMain.handle("status:report", async (_event, status: AppStatus) => {
  if (!status.ok) {
    console.warn(`[${status.code ?? "status"}] ${status.title}: ${status.message}`);
    await appendLog(settingsCache, `[${status.code ?? "status"}] ${status.title}`, status.message);
  }
});
