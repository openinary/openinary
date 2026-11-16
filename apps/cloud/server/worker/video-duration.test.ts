import assert from "node:assert/strict";
import { parseDuration } from "./video-duration.js";

// MP4: ftyp (skipped by size) + moov > mvhd (version 0, timescale 1000,
// duration 5000 -> 5s).
const mvhdV0 = new Uint8Array(8 + 20);
new DataView(mvhdV0.buffer).setUint32(0, mvhdV0.length, false);
mvhdV0.set([0x6d, 0x76, 0x68, 0x64], 4); // "mvhd"
new DataView(mvhdV0.buffer).setUint32(8 + 12, 1000, false); // timescale
new DataView(mvhdV0.buffer).setUint32(8 + 16, 5000, false); // duration
const moov = new Uint8Array(8 + mvhdV0.length);
new DataView(moov.buffer).setUint32(0, moov.length, false);
moov.set([0x6d, 0x6f, 0x6f, 0x76], 4); // "moov"
moov.set(mvhdV0, 8);
const ftyp = new Uint8Array(16);
new DataView(ftyp.buffer).setUint32(0, ftyp.length, false);
ftyp.set([0x66, 0x74, 0x79, 0x70], 4); // "ftyp"
const mp4 = new Blob([ftyp, moov]);
assert.equal(await parseDuration(mp4, "mp4"), 5);

// Same mvhd, but with a huge declared-size "mdat" placed before moov and
// never actually materialized - proves mdat is skipped by size, not read.
const mdatHeader = new Uint8Array(8);
new DataView(mdatHeader.buffer).setUint32(0, 8 + 2_000_000, false); // declared size only
mdatHeader.set([0x6d, 0x64, 0x61, 0x74], 4); // "mdat"
const mp4TrailingMoov = new Blob([
  ftyp,
  mdatHeader,
  new Uint8Array(2_000_000),
  moov,
]);
assert.equal(await parseDuration(mp4TrailingMoov, "mp4"), 5);

// WebM: Segment > Info > (TimecodeScale=1_000_000 default omitted,
// Duration=2500.0 as 4-byte float) -> 2500 * 1_000_000 / 1e9 = 2.5s.
const durationEl = new Uint8Array(2 + 1 + 4);
durationEl.set([0x44, 0x89, 0x84], 0); // Duration ID (2B) + size vint (4)
new DataView(durationEl.buffer, 3).setFloat32(0, 2500, false);
const info = new Uint8Array(4 + 1 + durationEl.length);
info.set([0x15, 0x49, 0xa9, 0x66], 0); // Info ID (4B)
info[4] = 0x80 | durationEl.length; // size vint (1 byte)
info.set(durationEl, 5);
const segment = new Uint8Array(4 + 1 + info.length);
segment.set([0x18, 0x53, 0x80, 0x67], 0); // Segment ID (4B)
segment[4] = 0x80 | info.length; // size vint (1 byte, assumes < 128)
segment.set(info, 5);
const webm = new Blob([segment]);
assert.equal(await parseDuration(webm, "webm"), 2.5);

assert.equal(
  await parseDuration(new Blob([new Uint8Array(4)]), "mp4"),
  null,
);

console.log("video-duration: ok");
