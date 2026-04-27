import { app } from "electron";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { InterpreterSettings } from "../shared/types.js";

export function logPath(): string {
  return join(app.getPath("userData"), "session-errors.log");
}

export async function appendLog(settings: InterpreterSettings | null, message: string, details?: unknown): Promise<void> {
  if (settings && !settings.loggingEnabled) return;
  const line = [
    new Date().toISOString(),
    message,
    details === undefined ? "" : typeof details === "string" ? details : JSON.stringify(details)
  ].filter(Boolean).join(" | ");
  await mkdir(dirname(logPath()), { recursive: true });
  await appendFile(logPath(), `${line}\n`, "utf8");
}

export async function readLog(): Promise<string> {
  try {
    return await readFile(logPath(), "utf8");
  } catch {
    return "";
  }
}

export async function clearLog(): Promise<void> {
  await mkdir(dirname(logPath()), { recursive: true });
  await writeFile(logPath(), "", "utf8");
}
