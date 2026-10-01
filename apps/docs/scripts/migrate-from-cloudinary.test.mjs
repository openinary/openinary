// node --test apps/docs/scripts/migrate-from-cloudinary.test.mjs
// Runs the migration against a fake Cloudinary + Openinary and checks the
// paths, the log, and that a second run resumes instead of re-uploading.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const script = new URL("./migrate-from-cloudinary.mjs", import.meta.url).pathname;

test("copies assets, keeps public_id paths, resumes on re-run", async () => {
  const uploads = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const base = `http://localhost:${server.address().port}`;
    const asset = (public_id, format) => ({
      public_id,
      format,
      secure_url: `${base}/files/${public_id}${format ? `.${format}` : ""}`,
    });
    const json = (body, status = 200) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    if (url.pathname === "/v1_1/demo/resources/image/upload") {
      return url.searchParams.get("next_cursor")
        ? json({ resources: [asset("logo", "png")] })
        : json({ resources: [asset("avatars/jane", "jpg"), asset("icons/x", "svg")], next_cursor: "p2" });
    }
    if (url.pathname === "/v1_1/demo/resources/video/upload") return json({ resources: [asset("clips/intro", "mp4")] });
    if (url.pathname === "/v1_1/demo/resources/raw/upload") return json({ resources: [asset("docs/terms.pdf")] });
    if (url.pathname.startsWith("/files/")) {
      res.writeHead(200, { "content-type": "image/jpeg" });
      return res.end("bytes");
    }
    if (url.pathname === "/upload") {
      assert.equal(req.headers.authorization, "Bearer oik_test");
      const form = await new Request(base, { method: "POST", headers: req.headers, body: req, duplex: "half" }).formData();
      const folder = form.get("folder");
      const path = folder ? `${folder}/${form.get("files").name}` : form.get("files").name;
      uploads.push(path);
      return json({ success: true, files: [{ path, url: `/b/bkt/t/${path}` }] });
    }
    json({ error: "not found" }, 404);
  });
  await new Promise((resolve) => server.listen(0, resolve));

  const log = join(mkdtempSync(join(tmpdir(), "cld-")), "log.jsonl");
  const run = () =>
    new Promise((resolve) => {
      const port = server.address().port;
      const child = spawn(process.execPath, [script], {
        env: {
          ...process.env,
          CLOUDINARY_CLOUD_NAME: "demo",
          CLOUDINARY_API_KEY: "k",
          CLOUDINARY_API_SECRET: "s",
          CLOUDINARY_API_URL: `http://localhost:${port}`,
          OPENINARY_URL: `http://localhost:${port}`,
          OPENINARY_API_KEY: "oik_test",
          MIGRATION_LOG: log,
        },
      });
      child.on("exit", resolve);
    });

  assert.equal(await run(), 0);
  assert.deepEqual(uploads.sort(), ["avatars/jane.jpg", "clips/intro.mp4", "logo.png"]);

  const entries = readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(
    entries.filter((e) => e.status === "unsupported").map((e) => e.path).sort(),
    ["docs/terms.pdf", "icons/x.svg"],
  );
  assert.match(entries.find((e) => e.path === "avatars/jane.jpg").to, /\/b\/bkt\/t\/avatars\/jane\.jpg$/);

  assert.equal(await run(), 0);
  assert.equal(uploads.length, 3, "second run must not re-upload");
  server.close();
});
