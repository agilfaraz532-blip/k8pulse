/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend origin for split deployments, e.g. https://k8pulse.ngrok.app (empty = same origin) */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
