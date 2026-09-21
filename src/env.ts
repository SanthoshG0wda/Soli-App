import "server-only";

import { z } from "zod";
import {
  DEFAULT_CHUNK_OVERLAP,
  DEFAULT_CHUNK_SIZE,
  DEFAULT_EMBEDDING_DIMENSIONS,
  DEFAULT_RAG_CHUNK_MAX_CHARS,
  DEFAULT_RAG_CONTEXT_MAX_CHARS,
  DEFAULT_RAG_TEMPERATURE,
  DEFAULT_TOP_K,
} from "@/config";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required"),
  NIM_BASE_URL: z
    .string()
    .url("NIM_BASE_URL must be a valid URL")
    .default("https://integrate.api.nvidia.com/v1"),
  NVIDIA_API_KEY: z
    .string()
    .min(1, "NVIDIA_API_KEY is required to call NVIDIA NIM"),
  NIM_LLM_MODEL: z
    .string()
    .min(1, "NIM_LLM_MODEL is required")
    .default("nvidia/nvidia-nemotron-nano-9b-v2"),
  NIM_EMBEDDING_MODEL: z
    .string()
    .min(1, "NIM_EMBEDDING_MODEL is required")
    .default("nvidia/nvidia-embed-qa-4"),
  EMBEDDING_DIMENSIONS: z
    .coerce.number()
    .int()
    .positive()
    .default(DEFAULT_EMBEDDING_DIMENSIONS),
  QDRANT_URL: z
    .string()
    .url("QDRANT_URL must be a valid URL (e.g. https://<cluster>.cloud.qdrant.io:6333)"),
  QDRANT_API_KEY: z
    .string()
    .min(1, "QDRANT_API_KEY is required for Qdrant Cloud"),
  QDRANT_COLLECTION: z.string().min(1).default("soli_chunks"),
  CHUNK_SIZE: z.coerce.number().int().positive().default(DEFAULT_CHUNK_SIZE),
  CHUNK_OVERLAP: z.coerce.number().int().min(0).default(DEFAULT_CHUNK_OVERLAP),
  TOP_K: z.coerce.number().int().positive().default(DEFAULT_TOP_K),
  RAG_CONTEXT_MAX_CHARS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_RAG_CONTEXT_MAX_CHARS),
  RAG_CHUNK_MAX_CHARS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_RAG_CHUNK_MAX_CHARS),
  RAG_TEMPERATURE: z.coerce
    .number()
    .min(0)
    .max(2)
    .default(DEFAULT_RAG_TEMPERATURE),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters long"),
  SESSION_MAX_AGE_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(7 * 24 * 60 * 60),
  ADMIN_EMAILS: z
    .string()
    .optional()
    .default(""),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".") ?? "(root)"}: ${issue.message}`)
    .join("\n  ");
  throw new Error(`Invalid environment variables:\n  ${details}`);
}

export const env = parsed.data;