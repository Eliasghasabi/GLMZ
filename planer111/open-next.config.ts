import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * OpenNext → Cloudflare adapter configuration.
 *
 * Default minimal setup — deliberately WITHOUT incremental-cache / tag-cache
 * overrides so the app runs entirely within the Cloudflare FREE plan
 * (no KV, R2, Durable Objects or Queues required).
 */
export default defineCloudflareConfig({});
