export type VectorErrorCode =
  | "config"
  | "auth"
  | "collection_not_found"
  | "collection_already_exists"
  | "network"
  | "timeout"
  | "validation"
  | "internal";

export class VectorStoreError extends Error {
  readonly code: VectorErrorCode;
  readonly operation: string;
  readonly cause?: unknown;

  constructor(options: {
    code: VectorErrorCode;
    operation: string;
    message: string;
    cause?: unknown;
  }) {
    super(options.message);
    this.name = "VectorStoreError";
    this.code = options.code;
    this.operation = options.operation;
    this.cause = options.cause;
  }
}

/** Best-effort classification of unknown errors thrown by the Qdrant client. */
export function classifyError(
  operation: string,
  error: unknown,
): VectorStoreError {
  const message = error instanceof Error ? error.message : String(error);

  let code: VectorErrorCode = "internal";
  if (message.includes("401") || message.includes("Forbidden") || message.includes("403")) {
    code = "auth";
  } else if (message.includes("404") || message.toLowerCase().includes("not found")) {
    code = "collection_not_found";
  } else if (message.toLowerCase().includes("timed out")) {
    code = "timeout";
  } else if (message.toLowerCase().includes("fetch failed") || message.toLowerCase().includes("network")) {
    code = "network";
  }

  return new VectorStoreError({
    code,
    operation,
    message:
      code === "internal"
        ? message
        : `${operation} failed (${code})`,
    cause: error,
  });
}