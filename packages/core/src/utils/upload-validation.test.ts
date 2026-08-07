import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_UPLOAD_TYPES,
  allowedUploadExtensions,
  contentTypeForExt,
  stripUrlHostile,
  validateUploadContent,
  validateUploadFileType,
} from './upload-validation';

const BASE = 'https://cdn.example.com/t';

// How a key is delivered: the client encodes per segment, the browser parses,
// the transform route decodes per segment.
function roundTrip(key: string): string {
  const url = new URL(
    `${BASE}/${key.split('/').map(encodeURIComponent).join('/')}`,
  );
  return url.pathname
    .slice('/t/'.length)
    .split('/')
    .map(decodeURIComponent)
    .join('/');
}

test('drops the characters that truncate a URL', () => {
  // Reported by a user whose video would not play: the "#" ended the path,
  // so the CDN was asked for "VAULT/The " and answered 404.
  assert.equal(
    stripUrlHostile('VAULT/The #1 clip.mp4'),
    'VAULT/The 1 clip.mp4',
  );
  assert.equal(stripUrlHostile('what now?.png'), 'what now.png');
});

test('drops "%", which would round trip as a different key', () => {
  // Readers decode, so a stored "50%20off.mp4" is looked up as "50 off.mp4".
  assert.equal(stripUrlHostile('50%20off.mp4'), '5020off.mp4');
});

test('drops control characters', () => {
  assert.equal(stripUrlHostile('a\u0000b\u001fc.png'), 'abc.png');
});

test('keeps everything a URL can carry', () => {
  for (const name of [
    'La Marée.png',
    'clip [final].mp4',
    "a+b & c's.jpg",
    'Vidéos/Été 2026/plage.mov',
    'nested/folder/photo.jpg',
  ]) {
    assert.equal(stripUrlHostile(name), name);
  }
});

test('what it returns survives the delivery round trip', () => {
  for (const raw of [
    'VAULT/The #1 clip.mp4',
    'OPTIMIZED/50% off? maybe.mp4',
    'Vidéos/Été 2026/plage.mov',
  ]) {
    const key = stripUrlHostile(raw);
    assert.equal(roundTrip(key), key);
  }
});

test('the raw name does not - which is the bug', () => {
  const url = new URL(`${BASE}/VAULT/The #1 clip.mp4`);
  assert.notEqual(url.hash, '');
  assert.equal(url.pathname.endsWith('.mp4'), false);
});

test("accepts audio and 3D uploads with the MIME variants browsers send", () => {
  assert.ok(validateUploadFileType("sfx.wav", "audio/wav"));
  assert.ok(validateUploadFileType("sfx.wav", "audio/x-wav"));
  assert.ok(validateUploadFileType("track.mp3", "audio/mpeg"));
  assert.ok(validateUploadFileType("amb.ogg", "application/ogg"));
  assert.ok(validateUploadFileType("duck.glb", "model/gltf-binary"));
  // browsers usually send .glb as octet-stream, the same as .psd
  assert.ok(validateUploadFileType("duck.glb", "application/octet-stream"));
  assert.ok(validateUploadFileType("scene.gltf", "model/gltf+json"));
});

test("still rejects disallowed types and ext/MIME mismatches", () => {
  assert.ok(!validateUploadFileType("evil.svg", "image/svg+xml"));
  assert.ok(!validateUploadFileType("clip.wav", "video/mp4"));
});

test("the existing image/video whitelist is preserved", () => {
  assert.deepEqual(ALLOWED_UPLOAD_TYPES["image/jpeg"], [".jpg", ".jpeg"]);
  assert.deepEqual(ALLOWED_UPLOAD_TYPES["image/heic"], [".heic", ".heif"]);
  assert.deepEqual(ALLOWED_UPLOAD_TYPES["video/mp4"], [".mp4"]);
  // octet-stream now covers psd + the new 3D types
  assert.deepEqual(ALLOWED_UPLOAD_TYPES["application/octet-stream"], [
    ".psd",
    ".glb",
    ".gltf",
  ]);
});

test("allowedUploadExtensions lists the accepted types for error messages", () => {
  const exts = allowedUploadExtensions();
  for (const e of ["glb", "gltf", "wav", "mp3", "ogg", "jpg", "mp4", "psd"]) {
    assert.ok(exts.includes(e), `${e} should be listed`);
  }
  // sorted + de-duplicated (aliases like jpeg/jpg both appear once each)
  assert.deepEqual(exts, [...new Set(exts)].sort());
});

test("content-type comes from the same table; unknown falls back to octet-stream", () => {
  assert.equal(contentTypeForExt("glb"), "model/gltf-binary");
  assert.equal(contentTypeForExt("wav"), "audio/wav");
  assert.equal(contentTypeForExt("jpeg"), "image/jpeg"); // alias of jpg
  assert.equal(contentTypeForExt("mp4"), "video/mp4");
  assert.equal(contentTypeForExt("xyz"), "application/octet-stream");
  assert.equal(contentTypeForExt(undefined), "application/octet-stream");
});

// --- content validation (magic bytes) ---------------------------------------
// The MIME type and the extension are both attacker-supplied; the bytes are not.

/** A buffer starting with `head`, padded so length is never what is asserted. */
const body = (head: Buffer | string): Buffer =>
  Buffer.concat([Buffer.from(head as any, "latin1"), Buffer.alloc(64)]);

test("accepts files whose bytes match the extension", () => {
  assert.ok(validateUploadContent("duck.glb", body("glTF\x02\x00\x00\x00")));
  assert.ok(validateUploadContent("scene.gltf", body('  {"asset":{}}')));
  assert.ok(
    validateUploadContent("sfx.wav", body("RIFF\x24\x08\x00\x00WAVEfmt ")),
  );
  assert.ok(validateUploadContent("amb.ogg", body("OggS")));
  assert.ok(validateUploadContent("track.mp3", body("ID3\x03")));
  assert.ok(validateUploadContent("track.mp3", body("\xff\xfb\x90"))); // frame sync
  assert.ok(validateUploadContent("art.psd", body("8BPS")));
  assert.ok(validateUploadContent("photo.jpg", body("\xff\xd8\xff\xe0")));
  assert.ok(validateUploadContent("photo.png", body("\x89PNG\r\n\x1a\n")));
  assert.ok(validateUploadContent("anim.gif", body("GIF89a")));
  assert.ok(validateUploadContent("pic.webp", body("RIFF\x00\x00\x00\x00WEBP")));
  assert.ok(validateUploadContent("clip.mp4", body("\x00\x00\x00\x20ftypisom")));
  assert.ok(validateUploadContent("clip.webm", body("\x1a\x45\xdf\xa3")));
});

test("rejects a payload renamed to an allowed extension", () => {
  // The case the whitelist alone cannot catch: arbitrary bytes sent as
  // application/octet-stream under a .glb name.
  assert.ok(!validateUploadContent("evil.glb", body("MZ\x90\x00")));   // PE binary
  assert.ok(!validateUploadContent("evil.glb", body("<script>alert(1)")));
  assert.ok(!validateUploadContent("evil.gltf", body("<html><body>")));
  assert.ok(!validateUploadContent("evil.wav", body("<svg onload=")));
  assert.ok(!validateUploadContent("evil.psd", body("#!/bin/sh\n")));
  assert.ok(!validateUploadContent("evil.mp4", body("<!DOCTYPE html>")));
  assert.ok(!validateUploadContent("evil.png", body("\xff\xd8\xff"))); // jpeg as png
});

test("a QuickTime .mov that does not open on ftyp is still accepted", () => {
  // ftyp postdates QuickTime, so files from older cameras and encoders open on
  // another box. Requiring ftyp here would reject uploads that work today -
  // checked against real ffmpeg output, which does write ftyp, and against the
  // legacy layouts, which do not.
  const box = (type: string, size = 8) =>
    Buffer.concat([
      Buffer.from([0, 0, 0, size]),
      Buffer.from(type, "latin1"),
      Buffer.alloc(size - 8),
    ]);
  for (const first of ["wide", "moov", "mdat", "free", "skip", "pnot"]) {
    assert.ok(
      validateUploadContent("clip.mov", Buffer.concat([box(first, 16), box("mdat", 16)])),
      `.mov opening on ${first} should be accepted`,
    );
  }
  // and the common case still works
  assert.ok(validateUploadContent("clip.mov", body("\x00\x00\x00\x14ftypqt  ")));
});

test("empty and truncated files are rejected, not crashed on", () => {
  assert.ok(!validateUploadContent("duck.glb", Buffer.alloc(0)));
  assert.ok(!validateUploadContent("sfx.wav", Buffer.from("RIF")));
});

test("an extension with no signature is left to the whitelist", () => {
  // validateUploadFileType already rejects these; content check must not be the
  // thing that decides, or a newly whitelisted type would silently 400.
  assert.ok(validateUploadContent("notes.txt", body("hello")));
});
