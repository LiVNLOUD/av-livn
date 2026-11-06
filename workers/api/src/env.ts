export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ADMIN_TOKEN?: string;
  /** K0: fine-grained token, Actions read/write on this repo only (set by deploy.yml from the repo secret). */
  GH_DISPATCH_TOKEN?: string;
  /** K0: ntfy topic for the stale alert (set by deploy.yml from the repo secret). */
  NTFY_TOPIC?: string;
}
