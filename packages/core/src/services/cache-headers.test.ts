import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import sharp from "sharp";
import { TransformService } from "./transform.service";
import { enginePathsIn } from "../config/paths";
import { derivativeEtag, sniffImageContentType } from "../utils/delivery-headers";

test("sniffImageContentType reads the encoded format, not the name", async () => {
  const img = sharp({ create: { width: 16, height: 16, channels: 3, background: "#09f" } });
  assert.equal(sniffImageContentType(await img.clone().jpeg().toBuffer()), "image/jpeg");
  assert.equal(sniffImageContentType(await img.clone().png().toBuffer()), "image/png");
  assert.equal(sniffImageContentType(await img.clone().webp().toBuffer()), "image/webp");
  assert.equal(sniffImageContentType(await img.clone().avif().toBuffer()), "image/avif");
  assert.equal(sniffImageContentType(await img.clone().gif().toBuffer()), "image/gif");
  assert.equal(sniffImageContentType(Buffer.from("not an image at all")), undefined);
});

test("derivativeEtag is a valid strong entity-tag that follows the bytes", () => {
  const a = derivativeEtag(Buffer.from("a"));
  assert.match(a, /^"[0-9a-f]{32}"$/);
  assert.equal(derivativeEtag(Buffer.from("a")), a);
  assert.notEqual(derivativeEtag(Buffer.from("b")), a);
});

/** A service over a temp public folder holding photo.jpg. */
const withService = async (fn: (service: TransformService) => Promise<void>) => {
  const dir = await mkdtemp(join(tmpdir(), "cache-headers-"));
  try {
    await mkdir(join(dir, "public"));
    await sharp({ create: { width: 64, height: 48, channels: 3, background: "#c33" } })
      .jpeg()
      .toFile(join(dir, "public", "photo.jpg"));
    await fn(new TransformService(null, {} as any, enginePathsIn(dir)));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

for (const [accept, expected] of [
  ["image/avif,image/webp,image/*", "image/avif"],
  ["image/webp,image/*", "image/webp"],
] as const) {
  test(`a cached derivative keeps its real type and ETag (${expected}) (#102)`, async () => {
    await withService(async (service) => {
      // A non-browser agent, so only Accept decides the format.
      const request = { path: "/t/w_32/photo.jpg", userAgent: "test-client", acceptHeader: accept };

      // The local cache keeps a derivative from its second request on.
      const fresh = await service.transform(request);
      await service.transform(request);
      const cached = await service.transform(request);

      assert.equal(fresh.contentType, expected);
      assert.equal(sniffImageContentType(fresh.buffer!), expected, "fresh body matches its label");
      assert.equal(cached.contentType, expected);
      assert.equal(sniffImageContentType(cached.buffer!), expected, "cached body matches its label");
      assert.equal(cached.headers.ETag, fresh.headers.ETag);
      assert.match(fresh.headers.ETag, /^"[0-9a-f]{32}"$/);
    });
  });
}

test("a different output gets a different ETag", async () => {
  await withService(async (service) => {
    const a = await service.transform({ path: "/t/w_32/photo.jpg", userAgent: "" });
    const b = await service.transform({ path: "/t/w_16/photo.jpg", userAgent: "" });
    assert.notEqual(a.headers.ETag, b.headers.ETag);
  });
});
