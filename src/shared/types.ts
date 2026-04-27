export type DetectionMode = "auto" | "non-en" | "de" | "fr" | "es" | "it" | "pt" | "nl" | "pl" | "tr" | "fa" | "ar" | "ru" | "uk" | "ja" | "ko" | "zh";

export type TargetLanguage = "en" | "fa" | "ar" | "de" | "fr" | "es" | "it" | "pt" | "nl" | "pl" | "tr" | "ru" | "uk" | "ja" | "ko" | "zh";

export type TranslationProvider = "mock" | "openai" | "deepl" | "google" | "local" | "azure" | "libre";

export type DisplayMode = "below" | "replace" | "compact";

export interface InterpreterSettings {
  enabled: boolean;
  detectionMode: DetectionMode;
  targetLanguage: TargetLanguage;
  targetLanguages: TargetLanguage[];
  displayMode: DisplayMode;
  provider: TranslationProvider;
  openaiApiKey: string;
  openaiModel: string;
  deeplApiKey: string;
  googleApiKey: string;
  azureApiKey: string;
  azureRegion: string;
  azureEndpoint: string;
  libreBaseUrl: string;
  libreApiKey: string;
  localBaseUrl: string;
  localApiKey: string;
  localModel: string;
  minCharacters: number;
  debounceMs: number;
  keepOriginalVisible: boolean;
  debugOverlayEnabled: boolean;
  translateBacklogLimit: number;
  visibleOnly: boolean;
  loggingEnabled: boolean;
}

export interface TranslationRequest {
  text: string;
  detectionMode: DetectionMode;
  targetLanguage: TargetLanguage;
  bypassCache?: boolean;
  strict?: boolean;
}

export interface TranslationResult {
  translatedText: string;
  detectedLanguage: string;
  provider: TranslationProvider;
  fromCache: boolean;
  durationMs?: number;
  outputTokens?: number;
  tokensPerSecond?: number;
}

export interface AppStatus {
  ok: boolean;
  title: string;
  message: string;
  code?: string;
}

export interface InterpreterApi {
  getSettings(): Promise<InterpreterSettings>;
  saveSettings(settings: InterpreterSettings): Promise<InterpreterSettings>;
  translate(request: TranslationRequest): Promise<TranslationResult>;
  testTranslate(settings: InterpreterSettings, request: TranslationRequest): Promise<TranslationResult>;
  listLocalModels(settings: InterpreterSettings): Promise<string[]>;
  setInterpreterEnabled(enabled: boolean): Promise<InterpreterSettings>;
  clearTranslationCache(): Promise<number>;
  openSettings(): Promise<void>;
  closeSettings(): Promise<void>;
  getLogs(): Promise<string>;
  clearLogs(): Promise<void>;
  reportStatus(status: AppStatus): Promise<void>;
  onSettingsChanged(callback: (settings: InterpreterSettings) => void): () => void;
}
