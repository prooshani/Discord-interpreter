import { contextBridge, ipcRenderer } from "electron";
import type { AppStatus, InterpreterApi, InterpreterSettings, TranslationRequest, TranslationResult } from "../shared/types.js";

declare global {
  interface Window {
    discordInterpreter: InterpreterApi;
  }
}

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
  reportStatus: (status: AppStatus) => ipcRenderer.invoke("status:report", status),
  onSettingsChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, settings: InterpreterSettings) => callback(settings);
    ipcRenderer.on("settings:changed", listener);
    return () => ipcRenderer.removeListener("settings:changed", listener);
  }
};

contextBridge.exposeInMainWorld("discordInterpreter", api);

type MessageJob = {
  element: HTMLElement;
  text: string;
};

type RenderedTranslation = {
  targetLanguage: string;
  result: TranslationResult;
};

let settings: InterpreterSettings | null = null;
let observer: MutationObserver | null = null;
let queueTimer: number | null = null;
let scannedCount = 0;
let translatedCount = 0;
let skippedCount = 0;
let queuedCount = 0;
let lastDebugLines: string[] = [];
let periodicScanId: number | null = null;
let isDraggingIndicator = false;
const pending = new Map<HTMLElement, MessageJob>();
const translated = new WeakMap<HTMLElement, string>();
const seenText = new WeakMap<HTMLElement, string>();

const contentSelector = [
  '[id^="message-content-"]',
  '[id*="message-content"]',
  '[class*="messageContent"]',
  '[class*="markup"]'
].join(",");

const articleSelector = [
  '[data-list-item-id*="chat-messages"]',
  '[role="article"]'
].join(",");

function injectStyles(): void {
  if (document.getElementById("discord-interpreter-style")) return;
  const style = document.createElement("style");
  style.id = "discord-interpreter-style";
  style.textContent = `
    .di-card {
      margin-top: 6px;
      border-left: 3px solid #2dd4bf;
      background: color-mix(in srgb, currentColor 5%, transparent);
      border-radius: 6px;
      padding: 7px 9px;
      max-width: min(760px, 92%);
      font-size: 0.925em;
      line-height: 1.38;
    }
    .di-meta {
      display: flex;
      align-items: center;
      gap: 7px;
      margin-bottom: 3px;
      color: #8ddbd1;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0;
    }
    .di-dot {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: #2dd4bf;
      flex: 0 0 auto;
    }
    .di-text {
      color: inherit;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .di-text[dir="rtl"] {
      direction: rtl;
      text-align: right;
      unicode-bidi: plaintext;
      font-family: "Vazir FD", "Vazir", "Vazirmatn", "Noto Naskh Arabic", "Noto Sans Arabic", Tahoma, "Segoe UI", sans-serif;
      font-feature-settings: "kern";
      font-kerning: normal;
    }
    .di-replaced {
      border-radius: 5px;
      outline: 1px solid color-mix(in srgb, #2dd4bf 45%, transparent);
      background: color-mix(in srgb, #2dd4bf 10%, transparent);
      padding: 1px 3px;
    }
    .di-status {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 2147483647;
      width: min(380px, calc(100vw - 36px));
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 8px;
      background: rgba(17, 19, 24, .96);
      color: #f4f7fb;
      box-shadow: 0 18px 50px rgba(0,0,0,.36);
      font: 13px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      padding: 14px 16px;
    }
    .di-status strong {
      display: block;
      font-size: 14px;
      margin-bottom: 4px;
    }
    .di-status button {
      margin-top: 10px;
      border: 0;
      border-radius: 6px;
      background: #2dd4bf;
      color: #061817;
      font-weight: 700;
      padding: 7px 10px;
      cursor: pointer;
    }
    .di-live-pill {
      position: fixed;
      top: var(--di-indicator-top, 8px);
      left: var(--di-indicator-left, 50%);
      transform: var(--di-indicator-transform, translateX(-50%));
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 6px;
      max-width: min(420px, calc(100vw - 520px));
      border: 1px solid rgba(45,212,191,.35);
      border-radius: 999px;
      background: rgba(18, 23, 32, .94);
      color: #e8f3f6;
      box-shadow: 0 8px 22px rgba(0,0,0,.22);
      font: 12px/1.3 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      padding: 5px 9px;
      pointer-events: auto;
      cursor: grab;
      user-select: none;
    }
    .di-live-pill:active {
      cursor: grabbing;
    }
    .di-live-pill button {
      border: 0;
      border-radius: 5px;
      background: transparent;
      color: #8ddbd1;
      font: inherit;
      font-weight: 700;
      padding: 2px 4px;
      cursor: pointer;
    }
    .di-live-dot {
      width: 8px;
      height: 8px;
      border-radius: 99px;
      background: #2dd4bf;
      flex: 0 0 auto;
    }
    .di-activity {
      position: fixed;
      top: var(--di-indicator-top, 8px);
      left: var(--di-indicator-left, 50%);
      transform: var(--di-indicator-transform, translateX(-50%));
      z-index: 2147483646;
      display: flex;
      align-items: center;
      gap: 8px;
      max-width: min(360px, calc(100vw - 560px));
      border: 1px solid rgba(45,212,191,.28);
      border-radius: 999px;
      background: rgba(18, 23, 32, .92);
      color: #dbeafe;
      box-shadow: 0 8px 22px rgba(0,0,0,.2);
      font: 12px/1.3 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      padding: 5px 9px;
      pointer-events: auto;
      cursor: grab;
      user-select: none;
    }
    .di-activity:active {
      cursor: grabbing;
    }
    .di-activity-dot {
      width: 8px;
      height: 8px;
      border-radius: 99px;
      background: #2dd4bf;
      flex: 0 0 auto;
    }
    .di-debug {
      position: fixed;
      top: calc(var(--di-indicator-top, 8px) + 34px);
      left: var(--di-indicator-left, 50%);
      transform: var(--di-indicator-transform, translateX(-50%));
      z-index: 2147483647;
      width: min(420px, calc(100vw - 28px));
      max-height: 220px;
      overflow: auto;
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 8px;
      background: rgba(10, 13, 19, .96);
      color: #d9e5ef;
      box-shadow: 0 18px 50px rgba(0,0,0,.32);
      font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      padding: 10px 12px;
      white-space: pre-wrap;
    }
    .di-debug[hidden] {
      display: none;
    }
    @media (max-width: 980px) {
      .di-live-pill,
      .di-activity {
        left: auto;
        right: 12px;
        top: auto;
        bottom: 74px;
        transform: none;
      }
      .di-debug {
        left: auto;
        right: 12px;
        top: auto;
        bottom: 118px;
        transform: none;
      }
    }
  `;
  const styleHost = document.head ?? document.documentElement;
  if (!styleHost) {
    window.addEventListener("DOMContentLoaded", injectStyles, { once: true });
    return;
  }
  styleHost.append(style);
}

function applyIndicatorPosition(): void {
  const raw = localStorage.getItem("discord-interpreter-indicator-position");
  if (!raw) return;
  try {
    const position = JSON.parse(raw) as { left?: number; top?: number };
    if (typeof position.left !== "number" || typeof position.top !== "number") return;
    document.documentElement.style.setProperty("--di-indicator-left", `${position.left}px`);
    document.documentElement.style.setProperty("--di-indicator-top", `${position.top}px`);
    document.documentElement.style.setProperty("--di-indicator-transform", "none");
  } catch {
    localStorage.removeItem("discord-interpreter-indicator-position");
  }
}

function saveIndicatorPosition(left: number, top: number): void {
  localStorage.setItem("discord-interpreter-indicator-position", JSON.stringify({ left, top }));
  applyIndicatorPosition();
}

function makeIndicatorDraggable(element: HTMLElement): void {
  if (element.dataset.diDraggable === "1") return;
  element.dataset.diDraggable = "1";
  element.addEventListener("pointerdown", (event) => {
    if (!(event.target instanceof HTMLElement)) return;
    if (event.target.tagName === "BUTTON") return;
    isDraggingIndicator = true;
    const rect = element.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;
    element.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      if (!isDraggingIndicator) return;
      if (Math.abs(moveEvent.clientX - startX) > 4 || Math.abs(moveEvent.clientY - startY) > 4) moved = true;
      const left = Math.max(8, Math.min(window.innerWidth - rect.width - 8, moveEvent.clientX - offsetX));
      const top = Math.max(8, Math.min(window.innerHeight - rect.height - 8, moveEvent.clientY - offsetY));
      document.documentElement.style.setProperty("--di-indicator-left", `${left}px`);
      document.documentElement.style.setProperty("--di-indicator-top", `${top}px`);
      document.documentElement.style.setProperty("--di-indicator-transform", "none");
    };
    const up = (upEvent: PointerEvent) => {
      isDraggingIndicator = false;
      element.releasePointerCapture(upEvent.pointerId);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", up);
      const finalRect = element.getBoundingClientRect();
      saveIndicatorPosition(finalRect.left, finalRect.top);
      if (!moved) void toggleInterpreterFromIndicator();
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", up);
  });
}

async function toggleInterpreterFromIndicator(): Promise<void> {
  if (!settings) return;
  const next = await api.setInterpreterEnabled(!settings.enabled);
  settings = next;
  if (next.enabled) {
    updateActivity("Interpreter on");
    updateLivePill("Interpreter on");
    scan();
  } else {
    clearQueue();
    updateActivity("Interpreter off");
    removeDebugOverlay();
  }
}

function debug(message: string): void {
  if (!settings?.debugOverlayEnabled) return;
  const time = new Date().toLocaleTimeString();
  lastDebugLines = [`${time} ${message}`, ...lastDebugLines].slice(0, 24);
  updateDebugPanel();
}

function showStatus(status: AppStatus): void {
  void api.reportStatus(status);
  if (!document.body) return;
  let panel = document.querySelector<HTMLElement>(".di-status");
  if (!panel) {
    panel = document.createElement("div");
    panel.className = "di-status";
    document.body.append(panel);
  }
  panel.innerHTML = "";
  const title = document.createElement("strong");
  title.textContent = status.title;
  const message = document.createElement("div");
  message.textContent = status.message;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Open settings";
  button.addEventListener("click", () => void api.openSettings());
  panel.append(title, message, button);
  window.setTimeout(() => panel?.remove(), 9000);
}

function updateActivity(message?: string): void {
  if (!document.body) return;
  let activity = document.querySelector<HTMLElement>(".di-activity");
  if (!activity) {
    activity = document.createElement("div");
    activity.className = "di-activity";
    const dot = document.createElement("span");
    dot.className = "di-activity-dot";
    const text = document.createElement("span");
    text.className = "di-activity-text";
    activity.append(dot, text);
    document.body.append(activity);
    makeIndicatorDraggable(activity);
  }
  activity.title = "Drag to move. Click to turn interpreter on or off.";
  const text = activity.querySelector<HTMLElement>(".di-activity-text");
  if (text) {
    text.textContent = message ?? `Interpreter ${settings?.enabled ? "on" : "off"}`;
  }
}

function updateLivePill(message?: string): void {
  if (!document.body) return;
  if (!settings?.debugOverlayEnabled) {
    removeDebugOverlay();
    return;
  }
  let pill = document.querySelector<HTMLElement>(".di-live-pill");
  if (!pill) {
    pill = document.createElement("div");
    pill.className = "di-live-pill";
    const dot = document.createElement("span");
    dot.className = "di-live-dot";
    const text = document.createElement("span");
    text.className = "di-live-text";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Settings";
    button.addEventListener("click", () => void api.openSettings());
    const rescan = document.createElement("button");
    rescan.type = "button";
    rescan.textContent = "Rescan";
    rescan.addEventListener("click", () => {
      debug("manual rescan requested");
      scan(document, settings?.translateBacklogLimit ?? 30);
    });
    const toggleDebug = document.createElement("button");
    toggleDebug.type = "button";
    toggleDebug.textContent = "Debug";
    toggleDebug.addEventListener("click", () => {
      const panel = ensureDebugPanel();
      panel.hidden = !panel.hidden;
    });
    pill.append(dot, text, rescan, toggleDebug, button);
    document.body.append(pill);
    makeIndicatorDraggable(pill);
  }
  const text = pill.querySelector<HTMLElement>(".di-live-text");
  if (text) {
    text.textContent = message ?? `Interpreter ${settings?.enabled ? "on" : "off"}`;
  }
}

function removeDebugOverlay(): void {
  document.querySelector<HTMLElement>(".di-live-pill")?.remove();
  document.querySelector<HTMLElement>(".di-debug")?.remove();
}

function ensureDebugPanel(): HTMLElement {
  let panel = document.querySelector<HTMLElement>(".di-debug");
  if (!panel) {
    if (!document.body) throw new Error("Document body is not ready for debug panel.");
    panel = document.createElement("div");
    panel.className = "di-debug";
    panel.hidden = true;
    document.body.append(panel);
  }
  return panel;
}

function updateDebugPanel(): void {
  if (!settings?.debugOverlayEnabled) return;
  if (!document.body) return;
  const panel = ensureDebugPanel();
  panel.textContent = lastDebugLines.join("\n");
}

function candidateText(element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".di-card,.di-meta,.di-text").forEach((node) => node.remove());
  return (clone.textContent ?? "").trim();
}

function isInTranslationViewport(element: HTMLElement): boolean {
  if (!settings?.visibleOnly) return true;
  const rect = element.getBoundingClientRect();
  const topLimit = 64;
  const bottomLimit = window.innerHeight - 92;
  const threshold = 160;
  return rect.bottom >= topLimit - threshold && rect.top <= bottomLimit + threshold;
}

function isEligible(element: HTMLElement, text: string): boolean {
  if (!settings?.enabled) {
    return false;
  }
  if (!text || text.length < settings.minCharacters) {
    skippedCount += 1;
    debug(`skip: too short "${text.slice(0, 80)}"`);
    return false;
  }
  if (element.closest('[role="textbox"], textarea, input, code, pre')) return false;
  if (!isInTranslationViewport(element)) {
    skippedCount += 1;
    debug(`skip: outside visible viewport "${text.slice(0, 80)}"`);
    return false;
  }
  if (translated.get(element) === text) return false;
  if (seenText.get(element) === text) return false;
  if (element.dataset.diProcessing === "1") return false;
  return true;
}

function enqueue(element: HTMLElement): void {
  if (!settings?.enabled) return;
  const text = candidateText(element);
  scannedCount += 1;
  if (!isEligible(element, text)) return;
  seenText.set(element, text);
  pending.set(element, { element, text });
  queuedCount += 1;
  debug(`queued: "${text.slice(0, 120)}"`);
  updateActivity("Translating...");
  updateLivePill("Translating...");
  if (queueTimer) window.clearTimeout(queueTimer);
  queueTimer = window.setTimeout(flushQueue, settings.debounceMs);
}

async function flushQueue(): Promise<void> {
  if (!settings?.enabled) {
    clearQueue();
    return;
  }
  const jobs = Array.from(pending.entries())
    .sort((a, b) => {
      const diff = b[0].getBoundingClientRect().top - a[0].getBoundingClientRect().top;
      if (Math.abs(diff) > 0.5) return diff;
      if (a[0] === b[0]) return 0;
      const pos = a[0].compareDocumentPosition(b[0]);
      return (pos & Node.DOCUMENT_POSITION_FOLLOWING) ? 1 : -1;
    })
    .slice(0, 8);
  for (const [element] of jobs) pending.delete(element);
  for (const job of jobs) {
    await translateMessage(job[1]).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unknown translation error.";
      debug(`error: ${message}`);
      showStatus({
        ok: false,
        title: "Translation unavailable",
        message,
        code: "TRANSLATION_FAILED"
      });
    });
  }
  if (pending.size > 0) {
    queueTimer = window.setTimeout(flushQueue, settings?.debounceMs ?? 350);
  }
}

async function translateMessage(job: MessageJob): Promise<void> {
  if (!settings?.enabled) return;
  job.element.dataset.diProcessing = "1";
  const targetLanguages = getTargetLanguages(settings);
  updateActivity("Translating...");
  updateLivePill("Translating...");
  const results: RenderedTranslation[] = [];
  let failureCount = 0;
  for (const targetLanguage of targetLanguages) {
    try {
      const result = await api.translate({
        text: job.text,
        detectionMode: settings.detectionMode,
        targetLanguage
      });
      if (result && result.translatedText.trim() !== job.text.trim()) {
        results.push({ targetLanguage, result });
      }
    } catch (error) {
      failureCount += 1;
      const message = error instanceof Error ? error.message : "unknown target translation error";
      debug(`target ${targetLanguage} failed: ${message}`);
    }
  }
  job.element.dataset.diProcessing = "0";
  if (results.length === 0) {
    skippedCount += 1;
    if (failureCount > 0) debug(`skip: ${failureCount} target failures for "${job.text.slice(0, 100)}"`);
    debug(`skip: no target translations for "${job.text.slice(0, 100)}"`);
    updateActivity();
    updateLivePill();
    return;
  }
  renderTranslations(job.element, job.text, results);
  translated.set(job.element, candidateText(job.element));
  translatedCount += results.length;
  debug(`translated: ${results.map(({ targetLanguage }) => targetLanguage.toUpperCase()).join(", ")} "${job.text.slice(0, 80)}"`);
  updateActivity();
  updateLivePill();
}

function getTargetLanguages(currentSettings: InterpreterSettings): Array<TranslationRequest["targetLanguage"]> {
  const values = Array.isArray(currentSettings.targetLanguages) && currentSettings.targetLanguages.length > 0
    ? currentSettings.targetLanguages
    : [currentSettings.targetLanguage];
  return Array.from(new Set(values)).filter((language): language is TranslationRequest["targetLanguage"] => Boolean(language));
}

function isRtlLanguage(language: string): boolean {
  return language === "fa" || language === "ar";
}

function renderTranslations(element: HTMLElement, originalText: string, translations: RenderedTranslation[]): void {
  if (!settings) return;
  element.querySelectorAll(":scope > .di-card").forEach((node) => node.remove());

  if (settings.displayMode === "replace") {
    element.dataset.diOriginal = originalText;
    element.title = originalText;
    element.classList.add("di-replaced");
    element.innerText = translations.map(({ targetLanguage, result }) => `[${targetLanguage.toUpperCase()}] ${result.translatedText}`).join("\n");
    element.setAttribute("dir", translations.some(({ targetLanguage }) => isRtlLanguage(targetLanguage)) ? "rtl" : "auto");
    return;
  }

  const card = document.createElement("div");
  card.className = "di-card";
  for (const translation of translations) {
    const meta = document.createElement("div");
    meta.className = "di-meta";
    const dot = document.createElement("span");
    dot.className = "di-dot";
    const label = document.createElement("span");
    label.textContent = `${translation.result.detectedLanguage.toUpperCase()} -> ${translation.targetLanguage.toUpperCase()} via ${translation.result.provider}`;
    meta.append(dot, label);
    const text = document.createElement("div");
    text.className = "di-text";
    text.textContent = translation.result.translatedText;
    text.dir = isRtlLanguage(translation.targetLanguage) ? "rtl" : "auto";
    card.append(meta, text);
  }
  if (!settings.keepOriginalVisible || settings.displayMode === "compact") {
    element.title = originalText;
  }
  element.append(card);
}

function findMessageTargets(root: ParentNode = document, limit = settings?.translateBacklogLimit ?? 30): HTMLElement[] {
  const targets = new Set<HTMLElement>();
  root.querySelectorAll<HTMLElement>(contentSelector).forEach((node) => {
    if (node.closest(articleSelector)) targets.add(node);
  });
  root.querySelectorAll<HTMLElement>(articleSelector).forEach((article) => {
    const content = article.querySelector<HTMLElement>(contentSelector);
    targets.add(content ?? article);
  });
  if (limit <= 0) return [];
  // Sort by on-screen vertical position, newest at bottom first.
  const sorted = Array.from(targets).sort((a, b) => {
    const diff = b.getBoundingClientRect().top - a.getBoundingClientRect().top;
    if (Math.abs(diff) > 0.5) return diff;
    if (a === b) return 0;
    const pos = a.compareDocumentPosition(b);
    return (pos & Node.DOCUMENT_POSITION_FOLLOWING) ? 1 : -1;
  });
  return sorted.slice(0, limit);
}

function scan(root: ParentNode = document, limit = settings?.translateBacklogLimit ?? 30): void {
  if (!settings?.enabled) {
    clearQueue();
    updateActivity("Interpreter off");
    updateLivePill("Interpreter off");
    return;
  }
  const nodes = findMessageTargets(root, limit);
  debug(`scan: found ${nodes.length} message candidates`);
  nodes.forEach(enqueue);
  updateActivity();
  updateLivePill();
}

function clearQueue(): void {
  pending.clear();
  if (queueTimer) {
    window.clearTimeout(queueTimer);
    queueTimer = null;
  }
}

function startObserver(): void {
  if (!document.body) return;
  if (observer) observer.disconnect();
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes)) {
        if (!(node instanceof HTMLElement)) continue;
        scan(node, 20);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  scan();
  window.setTimeout(() => scan(), 1200);
  window.setTimeout(() => scan(), 3500);
  if (periodicScanId) window.clearInterval(periodicScanId);
  periodicScanId = window.setInterval(() => scan(), 10000);
}

async function boot(): Promise<void> {
  injectStyles();
  applyIndicatorPosition();
  settings = await api.getSettings();
  debug(`boot: settings loaded provider=${settings.provider} detect=${settings.detectionMode} targets=${getTargetLanguages(settings).join(",")}`);
  api.onSettingsChanged((next) => {
    const wasEnabled = settings?.enabled;
    settings = next;
    debug(`settings changed provider=${settings.provider} detect=${settings.detectionMode} targets=${getTargetLanguages(settings).join(",")}`);
    if (!settings.debugOverlayEnabled) removeDebugOverlay();
    if (wasEnabled && !settings.enabled) {
      clearQueue();
      debug("interpreter disabled: queue cleared");
      removeDebugOverlay();
      updateActivity("Interpreter off");
      return;
    }
    if (settings.enabled) scan();
  });
  if (document.body) {
    injectStyles();
    startObserver();
  } else {
    window.addEventListener("DOMContentLoaded", () => {
      injectStyles();
      updateActivity("Interpreter on");
      updateLivePill("Interpreter on");
      startObserver();
    }, { once: true });
  }
  updateActivity("Interpreter on");
  updateLivePill("Interpreter on");
}

boot().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Interpreter preload failed.";
  showStatus({
    ok: false,
    title: "Interpreter failed to start",
    message,
    code: "BOOT_FAILED"
  });
});
