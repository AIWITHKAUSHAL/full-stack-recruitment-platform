/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set at build time by scripts/deploy.sh; falls back to the relative /api/v1. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
