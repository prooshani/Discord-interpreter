import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, nativeTheme, Notification, shell, session } from "electron";
import { join } from "node:path";
import { autoUpdater } from "electron-updater";
import { loadSettings, saveSettings } from "./settings-store.js";
import { appendLog, clearLog, readLog } from "./logging.js";
import { clearTranslationCache, translateText } from "./translation.js";
import type { AppStatus, InterpreterSettings, TranslationRequest } from "../shared/types.js";

let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let settingsCache: InterpreterSettings | null = null;
let updateDownloaded = false;
let updateCheckInProgress = false;
let manualUpdateCheckRequested = false;

const discordOrigin = "https://discord.com";
const discordUrl = "https://discord.com/app";
const windowsAppUserModelId = "local.discord.interpreter";
const appDisplayName = "Discord Interpreter";

app.setName("Discord-interpreter");
app.setAppUserModelId(windowsAppUserModelId);

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) app.quit();
app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

function appRoot(...parts: string[]): string {
  return join(app.getAppPath(), ...parts);
}

function appLogoPath(): string {
  if (app.isPackaged) return join(process.resourcesPath, "DI logo-s.png");
  return appRoot("DI logo-s.png");
}

function showNativeNotification(payload: { title?: string; body?: string }): boolean {
  if (!Notification.isSupported()) return false;
  const icon = nativeImage.createFromPath(appLogoPath());
  const notification = new Notification({
    title: payload.title?.trim() || "New Discord message",
    body: payload.body?.trim() || "",
    icon: icon.isEmpty() ? undefined : icon,
    urgency: "normal"
  });
  notification.on("click", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  notification.show();
  return true;
}

async function showInfo(message: string, detail = ""): Promise<void> {
  const options: Electron.MessageBoxOptions = {
    type: "info",
    title: appDisplayName,
    message,
    detail,
    buttons: ["OK"],
    noLink: true
  };
  if (mainWindow) await dialog.showMessageBox(mainWindow, options);
  else await dialog.showMessageBox(options);
}

async function checkForUpdatesFromMenu(): Promise<void> {
  if (!app.isPackaged) {
    await showInfo("Updates are only available in installed packaged builds.");
    return;
  }
  if (updateCheckInProgress) {
    await showInfo("An update check is already in progress.");
    return;
  }
  manualUpdateCheckRequested = true;
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    updateCheckInProgress = false;
    manualUpdateCheckRequested = false;
    buildMenu();
    const message = error instanceof Error ? error.message : "Unknown update check error.";
    await showInfo("Update check failed.", message);
  }
}

function installDownloadedUpdate(): void {
  if (!updateDownloaded) return;
  autoUpdater.quitAndInstall(false, true);
}

function setupAutoUpdater(): void {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    updateCheckInProgress = true;
    buildMenu();
  });

  autoUpdater.on("update-available", async (info) => {
    updateDownloaded = false;
    buildMenu();
    if (manualUpdateCheckRequested) {
      await showInfo("Update found", `Version ${info.version} is available. Download has started.`);
    }
  });

  autoUpdater.on("update-not-available", async () => {
    updateCheckInProgress = false;
    buildMenu();
    if (manualUpdateCheckRequested) {
      await showInfo("You are up to date.");
    }
    manualUpdateCheckRequested = false;
  });

  autoUpdater.on("error", async (error) => {
    updateCheckInProgress = false;
    manualUpdateCheckRequested = false;
    buildMenu();
    await appendLog(settingsCache, "Updater error", error.message);
    await showInfo("Updater error", error.message);
  });

  autoUpdater.on("update-downloaded", async (info) => {
    updateCheckInProgress = false;
    updateDownloaded = true;
    manualUpdateCheckRequested = false;
    buildMenu();
    const options: Electron.MessageBoxOptions = {
      type: "info",
      title: "Update ready",
      message: `Version ${info.version} is downloaded and ready to install.`,
      detail: "Install now to restart the app, or install later on next app quit.",
      buttons: ["Install now", "Later"],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    };
    const choice = mainWindow
      ? await dialog.showMessageBox(mainWindow, options)
      : await dialog.showMessageBox(options);
    if (choice.response === 0) installDownloadedUpdate();
  });
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
    title: `${appDisplayName} v${app.getVersion()}`,
    icon: appLogoPath(),
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
    title: `${appDisplayName} Settings v${app.getVersion()}`,
    icon: appLogoPath(),
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
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Check for Updates",
          enabled: app.isPackaged && !updateCheckInProgress,
          click: () => void checkForUpdatesFromMenu()
        },
        {
          label: "Install Downloaded Update and Restart",
          enabled: app.isPackaged && updateDownloaded,
          click: () => installDownloadedUpdate()
        },
        { type: "separator" },
        {
          label: "Test Notification",
          click: async () => {
            const ok = showNativeNotification({
              title: `${appDisplayName} test notification`,
              body: "If you can see this toast, Windows notifications are working."
            });
            if (ok) return;
            const options: Electron.MessageBoxOptions = {
              type: "warning",
              title: "Notifications unavailable",
              message: "Native notifications are not supported in this session.",
              detail: "Try running the installed packaged build from the Start menu, then test again.",
              buttons: ["OK"],
              noLink: true
            };
            if (mainWindow) await dialog.showMessageBox(mainWindow, options);
            else await dialog.showMessageBox(options);
          }
        },
        {
          label: "About",
          click: async () => {
            const version = app.getVersion();
            const buildFlavor = app.isPackaged ? "Packaged build" : "Development build";
            const logo = nativeImage.createFromPath(appLogoPath());
            const options: Electron.MessageBoxOptions = {
              type: "info",
              title: `About ${appDisplayName}`,
              message: `${appDisplayName} v${version}`,
              detail: `Build: ${buildFlavor}\nElectron: ${process.versions.electron}\nChrome: ${process.versions.chrome}\nNode.js: ${process.versions.node}`,
              icon: logo.isEmpty() ? undefined : logo,
              buttons: ["OK"],
              noLink: true
            };
            if (mainWindow) await dialog.showMessageBox(mainWindow, options);
            else await dialog.showMessageBox(options);
          }
        }
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
  setupAutoUpdater();

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

ipcMain.handle("notify:new-message", async (_event, payload: { title?: string; body?: string }) => {
  return showNativeNotification(payload);
});
