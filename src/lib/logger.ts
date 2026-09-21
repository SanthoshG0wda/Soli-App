// Tiny structured logger: one JSON object per line, level control via
// LOG_LEVEL. Kept dependency-free to avoid wiring a logging framework into
// every layer.

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function configuredLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL;
  if (raw === undefined) return "info";
  return raw in LEVEL_RANK ? (raw as LogLevel) : "info";
}

function write(level: LogLevel, message: string, context: Record<string, unknown>) {
  const rank = LEVEL_RANK[level];
  if (rank < LEVEL_RANK[configuredLevel()]) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...context,
  };
  const line = JSON.stringify(entry);
  const stream = level === "warn" || level === "error" ? process.stderr : process.stdout;
  stream.write(line + "\n");
}

export const logger: Logger = {
  debug(message, context = {}) {
    write("debug", message, context);
  },
  info(message, context = {}) {
    write("info", message, context);
  },
  warn(message, context = {}) {
    write("warn", message, context);
  },
  error(message, context = {}) {
    write("error", message, context);
  },
};