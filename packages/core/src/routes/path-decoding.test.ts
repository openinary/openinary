import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { createTransformRoute } from "./transform";

// Reported as "my image is still processing after 15 minutes": Hono's c.req.path
// is only decodeURI'd, which leaves reserved characters (, & @ + = ; : $)
// percent-encoded. Every write path stores keys fully decoded, so a correctly
// encoded URL for "a, b.png" was looked up as "a%2C b.png" and 404'd. Behind
// Openinary Cloud's Worker, which decodes the full key and answers 202 before
// the transform runs, that 404 surfaced as "processing" on every retry.
//
// These are the three names that hit it in production, as the dashboard
// encodes them (encodeURIComponent per segment).
const cases = [
  "ChatGPT Image Sep 26, 2026, 01_22_55 PM.png",
  "Drywall Installation & Repairs.jpg",
  "logo/Asset 5@4x.png",
  // A literal "%" must come back as itself, not as a second decode of "%20".
  "50%20off.png",
];

test("/t/* looks the source up under the fully decoded key", async () => {
  for (const key of cases) {
    let asked: string | undefined;
    const app = new Hono();
    app.route(
      "/t",
      createTransformRoute({
        storage: {
          existsOriginal: async (path: string) => {
            asked = path;
            return false;
          },
          invalidateAllCacheEntries: () => {},
        },
        queue: { getJobByPath: () => undefined, addJob: async () => "job-1" },
      } as any),
    );
    const encoded = key.split("/").map(encodeURIComponent).join("/");

    await app.request(`/t/w_300,h_300/${encoded}`);

    assert.equal(asked, key, `requested as ${encoded}`);
  }
});
