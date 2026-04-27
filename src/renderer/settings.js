const defaults = {
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

const labels = {
  provider: {
    mock: "Mock",
    openai: "OpenAI",
    local: "Local LLM",
    deepl: "DeepL",
    google: "Google",
    azure: "Azure Translator",
    libre: "LibreTranslate"
  }
};

const fields = [
  "enabled",
  "detectionMode",
  "displayMode",
  "provider",
  "openaiApiKey",
  "openaiModel",
  "deeplApiKey",
  "googleApiKey",
  "azureApiKey",
  "azureRegion",
  "azureEndpoint",
  "libreBaseUrl",
  "libreApiKey",
  "localBaseUrl",
  "localApiKey",
  "localModel",
  "minCharacters",
  "debounceMs",
  "keepOriginalVisible",
  "debugOverlayEnabled",
  "translateBacklogLimit",
  "visibleOnly",
  "loggingEnabled"
];

function field(id) {
  return document.getElementById(id);
}

function numberValue(id, min, max, fallback) {
  const parsed = Number(field(id).value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function readForm() {
  const targetLanguages = Array.from(document.querySelectorAll("[data-target-language]"))
    .filter((input) => input.checked)
    .map((input) => input.dataset.targetLanguage);
  const normalizedTargets = targetLanguages.length > 0 ? targetLanguages : defaults.targetLanguages;
  return {
    enabled: field("enabled").checked,
    detectionMode: field("detectionMode").value,
    targetLanguage: normalizedTargets[0],
    targetLanguages: normalizedTargets,
    displayMode: field("displayMode").value,
    provider: field("provider").value,
    openaiApiKey: field("openaiApiKey").value.trim(),
    openaiModel: field("openaiModel").value.trim() || defaults.openaiModel,
    deeplApiKey: field("deeplApiKey").value.trim(),
    googleApiKey: field("googleApiKey").value.trim(),
    azureApiKey: field("azureApiKey").value.trim(),
    azureRegion: field("azureRegion").value.trim(),
    azureEndpoint: field("azureEndpoint").value.trim() || defaults.azureEndpoint,
    libreBaseUrl: field("libreBaseUrl").value.trim() || defaults.libreBaseUrl,
    libreApiKey: field("libreApiKey").value.trim(),
    localBaseUrl: field("localBaseUrl").value.trim() || defaults.localBaseUrl,
    localApiKey: field("localApiKey").value.trim(),
    localModel: field("localModel").value.trim() || defaults.localModel,
    minCharacters: numberValue("minCharacters", 3, 200, defaults.minCharacters),
    debounceMs: numberValue("debounceMs", 100, 3000, defaults.debounceMs),
    keepOriginalVisible: field("keepOriginalVisible").checked,
    debugOverlayEnabled: field("debugOverlayEnabled").checked,
    translateBacklogLimit: numberValue("translateBacklogLimit", 0, 200, defaults.translateBacklogLimit),
    visibleOnly: field("visibleOnly").checked,
    loggingEnabled: field("loggingEnabled").checked
  };
}

function writeForm(settings) {
  const next = { ...defaults, ...settings };
  const targets = Array.isArray(next.targetLanguages) && next.targetLanguages.length > 0 ? next.targetLanguages : [next.targetLanguage ?? "en"];
  for (const id of fields) {
    const input = field(id);
    if (!input) continue;
    if (input.type === "checkbox") {
      input.checked = Boolean(next[id]);
    } else {
      input.value = String(next[id] ?? "");
    }
  }
  document.querySelectorAll("[data-target-language]").forEach((input) => {
    input.checked = targets.includes(input.dataset.targetLanguage);
  });
  syncProvider();
  syncLocalModelSelect(next.localModel);
}

function syncProvider() {
  const provider = field("provider").value || defaults.provider;
  document.querySelectorAll(".provider-card").forEach((card) => {
    card.dataset.selected = String(card.dataset.provider === provider);
  });
  document.querySelectorAll(".provider-settings").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.providerPanel !== provider);
  });
}

function showStatus(message, good = true) {
  const status = field("status");
  status.textContent = message;
  status.style.color = good ? "#aeeedc" : "#ffc5ce";
}

function validateSettings(settings) {
  if (settings.provider === "openai" && !settings.openaiApiKey) return "OpenAI API key is required.";
  if (settings.provider === "deepl" && !settings.deeplApiKey) return "DeepL API key is required.";
  if (settings.provider === "google" && !settings.googleApiKey) return "Google API key is required.";
  if (settings.provider === "azure") {
    if (!settings.azureApiKey) return "Azure Translator API key is required.";
    if (!settings.azureEndpoint) return "Azure endpoint is required.";
    try {
      new URL(settings.azureEndpoint);
    } catch {
      return "Azure endpoint URL is invalid.";
    }
  }
  if (settings.provider === "libre") {
    if (!settings.libreBaseUrl) return "LibreTranslate base URL is required.";
    try {
      new URL(settings.libreBaseUrl);
    } catch {
      return "LibreTranslate base URL is invalid.";
    }
  }
  if (settings.provider === "local") {
    if (!settings.localBaseUrl) return "Local LLM base URL is required.";
    if (!settings.localModel) return "Local LLM model is required.";
    try {
      new URL(settings.localBaseUrl);
    } catch {
      return "Local LLM base URL is invalid.";
    }
  }
  return "";
}

async function saveCurrentSettings() {
  const settings = readForm();
  const error = validateSettings(settings);
  if (error) {
    showStatus(error, false);
    return;
  }
  const saved = await window.discordInterpreter.saveSettings(settings);
  writeForm(saved);
  showStatus("Settings saved. Return to Discord and use Rescan if needed.");
}

async function runTest() {
  const settings = readForm();
  const error = validateSettings(settings);
  if (error) {
    showStatus(error, false);
    return;
  }
  const input = field("testInput").value.trim();
  if (!input) {
    showStatus("Enter sample text first.", false);
    return;
  }
  field("testResult").textContent = "Translating...";
  field("testStats").innerHTML = "";
  try {
    const results = [];
    const stats = [];
    for (const targetLanguage of settings.targetLanguages) {
      const result = await window.discordInterpreter.testTranslate(settings, {
        text: input,
        detectionMode: settings.detectionMode,
        targetLanguage,
        bypassCache: true,
        strict: true
      });
      results.push(`${targetLanguage.toUpperCase()} | ${result.detectedLanguage.toUpperCase()} | ${labels.provider[result.provider] ?? result.provider}\n${result.translatedText}`);
      if (result.tokensPerSecond || result.durationMs || result.outputTokens) {
        stats.push({
          label: `${targetLanguage.toUpperCase()} speed`,
          value: result.tokensPerSecond ? `${result.tokensPerSecond.toFixed(1)} tok/s` : "-",
          detail: `${result.outputTokens ?? "?"} output tokens / ${result.durationMs ?? "?"} ms`
        });
      }
    }
    field("testResult").textContent = results.join("\n\n");
    renderTestStats(stats);
    showStatus("Test completed. Settings were not saved.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Translation test failed.";
    field("testResult").textContent = message;
    field("testStats").innerHTML = "";
    showStatus(message, false);
  }
}

function renderTestStats(stats) {
  const container = field("testStats");
  container.innerHTML = "";
  if (stats.length === 0) return;
  for (const stat of stats) {
    const item = document.createElement("div");
    item.className = "metric-card";
    const label = document.createElement("span");
    label.textContent = stat.label;
    const value = document.createElement("strong");
    value.textContent = stat.value;
    const detail = document.createElement("small");
    detail.textContent = stat.detail;
    item.append(label, value, detail);
    container.append(item);
  }
}

function syncLocalModelSelect(model) {
  const select = field("localModelSelect");
  if (!select) return;
  const value = model || field("localModel")?.value || "";
  if (value && !Array.from(select.options).some((option) => option.value === value)) {
    select.add(new Option(value, value));
  }
  select.value = value;
}

async function refreshLocalModels() {
  const settings = readForm();
  const error = validateSettings({ ...settings, provider: "local" });
  if (error) {
    showStatus(error, false);
    return;
  }
  const select = field("localModelSelect");
  select.innerHTML = "";
  select.add(new Option("Loading models...", ""));
  showStatus("Loading local models...");
  try {
    const models = await window.discordInterpreter.listLocalModels(settings);
    select.innerHTML = "";
    for (const model of models) select.add(new Option(model, model));
    syncLocalModelSelect(settings.localModel);
    showStatus(models.length ? `Loaded ${models.length} local models.` : "No models returned by /v1/models.", models.length > 0);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load local models.";
    select.innerHTML = "";
    syncLocalModelSelect(settings.localModel);
    showStatus(message, false);
  }
}

async function refreshLogs() {
  field("logViewer").value = await window.discordInterpreter.getLogs();
}

function setupNavHighlight() {
  const links = Array.from(document.querySelectorAll("nav a"));
  const sections = links.map((link) => document.querySelector(link.getAttribute("href"))).filter(Boolean);
  const update = () => {
    const current = sections.reduce((active, section) => {
      const rect = section.getBoundingClientRect();
      return rect.top < 160 ? section : active;
    }, sections[0]);
    links.forEach((link) => {
      link.classList.toggle("active", link.getAttribute("href") === `#${current.id}`);
    });
  };
  document.addEventListener("scroll", update, { passive: true });
  update();
}

async function boot() {
  writeForm(await window.discordInterpreter.getSettings());
  setupNavHighlight();

  document.querySelectorAll(".provider-card").forEach((card) => {
    card.addEventListener("click", () => {
      field("provider").value = card.dataset.provider;
      syncProvider();
    });
  });

  document.querySelectorAll("[data-toggle-secret]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = field(button.dataset.toggleSecret);
      input.type = input.type === "password" ? "text" : "password";
      button.textContent = input.type === "password" ? "Show" : "Hide";
    });
  });

  fields.forEach((id) => {
    const input = field(id);
    if (!input) return;
    input.addEventListener("input", syncProvider);
    input.addEventListener("change", syncProvider);
  });

  field("save").addEventListener("click", () => {
    saveCurrentSettings().catch((error) => showStatus(error instanceof Error ? error.message : "Save failed.", false));
  });

  field("test").addEventListener("click", () => {
    runTest().catch((error) => showStatus(error instanceof Error ? error.message : "Test failed.", false));
  });

  field("refreshModels").addEventListener("click", () => {
    refreshLocalModels().catch((error) => showStatus(error instanceof Error ? error.message : "Model load failed.", false));
  });

  field("localModelSelect").addEventListener("change", () => {
    if (field("localModelSelect").value) field("localModel").value = field("localModelSelect").value;
  });

  field("refreshLogs").addEventListener("click", () => {
    refreshLogs().catch((error) => showStatus(error instanceof Error ? error.message : "Log refresh failed.", false));
  });

  field("clearCache").addEventListener("click", async () => {
    const removed = await window.discordInterpreter.clearTranslationCache();
    showStatus(`Translation cache cleared (${removed} entries).`);
  });

  field("clearLogs").addEventListener("click", async () => {
    await window.discordInterpreter.clearLogs();
    await refreshLogs();
    showStatus("Error log cleared.");
  });

  field("reset").addEventListener("click", () => {
    writeForm(defaults);
    showStatus("Defaults restored in form. Save to apply.");
  });

  field("close").addEventListener("click", () => {
    window.discordInterpreter.closeSettings();
  });

  refreshLogs().catch(() => {});

  showStatus("Ready.");
}

boot().catch((error) => {
  showStatus(error instanceof Error ? error.message : "Settings failed to load.", false);
});
