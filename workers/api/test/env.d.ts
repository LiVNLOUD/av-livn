declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ASSETS: Fetcher;
    ADMIN_TOKEN?: string;
    TEST_MIGRATIONS: import('cloudflare:test').D1Migration[];
  }
}
