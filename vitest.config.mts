import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      // vitest runs outside Next's bundler, which is what makes server-only
      // throw; route it to a no-op stub so env/providers stay importable.
      "server-only": new URL("./scripts/server-only-stub.ts", import.meta.url)
        .pathname,
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/soli_test",
      NVIDIA_API_KEY: "test-nvidia-key",
      NIM_BASE_URL: "https://integrate.api.nvidia.com/v1",
      NIM_LLM_MODEL: "nvidia/nvidia-nemotron-nano-9b-v2",
      NIM_EMBEDDING_MODEL: "nvidia/nvidia-embed-qa-4",
      EMBEDDING_DIMENSIONS: "3",
      QDRANT_URL: "http://localhost:6333",
      QDRANT_API_KEY: "test-qdrant-key",
      QDRANT_COLLECTION: "soli_test",
      TOP_K: "5",
    },
  },
});