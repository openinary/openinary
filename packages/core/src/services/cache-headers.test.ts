import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import sharp from "sharp";
import { TransformService } from "./transform.service";
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

const inTempPublic = async (fn: (dir: string) => Promise<void>) => {
  const dir = await mkdtemp(join(tmpdir(), "cache-headers-"));
  const cwd = process.cwd();
  try {
    process.chdir(dir);
    await mkdir("public", { recursive: true });
    await sharp({ create: { width: 64, height: 48, channels: 3, background: "#c33" } })
      .jpeg()
      .toFile(join(dir, "public", "photo.jpg"));
    await fn(dir);
  } finally {
    process.chdir(cwd);
    await rm(dir, { recursive: true, force: true });
  }
};

for (const [accept, expected] of [
  ["image/avif,image/webp,image/*", "image/avif"],
  ["image/webp,image/*", "image/webp"],
] as const) {
  test(`a cached derivative keeps its real type and ETag (${expected}) (#102)`, async () => {
    await inTempPublic(async () => {
      const service = new TransformService(null, { getJobByPath: () => undefined } as any);
      const request = { path: "/t/w_32/photo.jpg", userAgent: "", acceptHeader: accept, context: {} as any };

      const fresh = await service.transform(request as any);
      const cached = await service.transform(request as any);

      const freshType = fresh.contentType;
      assert.equal(sniffImageContentType(fresh.buffer!), freshType, "fresh body matches its label");
      assert.ok(freshType === expected || freshType.startsWith("image/"), freshType);
      assert.equal(cached.contentType, sniffImageContentType(cached.buffer!), "cached label matches its body");
      assert.equal(cached.contentType, freshType);
      assert.ok(cached.buffer!.equals(fresh.buffer!), "second request came from cache");
      assert.equal(cached.headers.ETag, fresh.headers.ETag);
      assert.match(fresh.headers.ETag, /^"[0-9a-f]{32}"$/);
    });
  });
}

test("a different output gets a different ETag", async () => {
  await inTempPublic(async () => {
    const service = new TransformService(null, { getJobByPath: () => undefined } as any);
    const a = await service.transform({ path: "/t/w_32/photo.jpg", userAgent: "", context: {} as any } as any);
    const b = await service.transform({ path: "/t/w_16/photo.jpg", userAgent: "", context: {} as any } as any);
    assert.notEqual(a.headers.ETag, b.headers.ETag);
  });
});
