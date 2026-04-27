import { contextBridge, ipcRenderer } from "electron";
import type { InterpreterApi, InterpreterSettings, TranslationRequest } from "../shared/types.js";

const api: InterpreterApi = {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings: InterpreterSettings) => ipcRenderer.invoke("settings:save", settings),
  translate: (request: TranslationRequest) => ipcRenderer.invoke("translate", request),
  testTranslate: (settings: InterpreterSettings, request: TranslationRequest) => ipcRenderer.invoke("translate:test", settings, request),
  listLocalModels: (settings: InterpreterSettings) => ipcRenderer.invoke("local:models", settings),
  setInterpreterEnabled: (enabled: boolean) => ipcRenderer.invoke("settings:enabled", enabled),
  clearTranslationCache: () => ipcRenderer.invoke("cache:clear"),
  openSettings: () => ipcRenderer.invoke("settings:open"),
  closeSettings: () => ipcRenderer.invoke("settings:close"),
  getLogs: () => ipcRenderer.invoke("logs:get"),
  clearLogs: () => ipcRenderer.invoke("logs:clear"),
  reportStatus: (status) => ipcRenderer.invoke("status:report", status),
  onSettingsChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, settings: InterpreterSettings) => callback(settings);
    ipcRenderer.on("settings:changed", listener);
    return () => ipcRenderer.removeListener("settings:changed", listener);
  }
};

contextBridge.exposeInMainWorld("discordInterpreter", api);
