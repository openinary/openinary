// Reads a video's source duration straight from its container metadata
// (MP4/MOV's mvhd atom, WebM's EBML Segment>Info>Duration) without any
// decode step, so this runs in the Worker - no ffmpeg required. Captured at
// upload time (see worker/app.ts). No longer a billing quantity: transcoding
// is billed on measured container time, and this only feeds the pre-flight
// estimate in worker/index.ts's checkVideoProcessing.
//
// Both formats let us skip straight to the metadata without buffering the
// (often huge) media payload: MP4 top-level boxes carry their own declared
// size, so the mdat box (the actual video bytes) is skipped by arithmetic
// rather than read, whether moov sits before or after it. WebM's Info
// element is written near the start of the Segment by every encoder that
// matters here (ffmpeg included), so a bounded head-read covers it.
//
// Returns null - never throws - on anything unparseable; the caller stores
// the video regardless and logs a 0-second charge rather than blocking the
// upload on a metadata quirk.

function readVintLength(first: number): number {
  if (first & 0x80) return 1;
  if (first & 0x40) return 2;
  if (first & 0x20) return 3;
  if (first & 0x10) return 4;
  if (first & 0x08) return 5;
  if (first & 0x04) return 6;
  if (first & 0x02) return 7;
  if (first & 0x01) return 8;
  return 0;
}

function readElementId(
  buf: Uint8Array,
  offset: number,
): { id: number; length: number } | null {
  if (offset >= buf.length) return null;
  const length = readVintLength(buf[offset]);
  if (length === 0 || offset + length > buf.length) return null;
  let id = 0;
  for (let i = 0; i < length; i++) id = id * 256 + buf[offset + i];
  return { id, length };
}

// EBML size vints strip the length marker bit; all-1s data bits mean
// "unknown size" (common for a not-yet-finalized Segment).
function readElementSize(
  buf: Uint8Array,
  offset: number,
): { size: number; length: number } | null {
  if (offset >= buf.length) return null;
  const first = buf[offset];
  const length = readVintLength(first);
  if (length === 0 || offset + length > buf.length) return null;
  const marker = 0x80 >> (length - 1);
  let size = first & (marker - 1);
  for (let i = 1; i < length; i++) size = size * 256 + buf[offset + i];
  const allOnes = size === 2 ** (7 * length) - 1;
  return { size: allOnes ? -1 : size, length };
}

// Scans siblings in [start, end) for the first element matching `targetId`,
// skipping over every other element by its declared size. An unknown-size
// element can't be skipped, so it's only usable as the returned match.
function findChildElement(
  buf: Uint8Array,
  start: number,
  end: number,
  targetId: number,
): { start: number; end: number } | null {
  let offset = start;
  while (offset < end) {
    const idInfo = readElementId(buf, offset);
    if (!idInfo) return null;
    const sizeInfo = readElementSize(buf, offset + idInfo.length);
    if (!sizeInfo) return null;
    const dataStart = offset + idInfo.length + sizeInfo.length;
    const dataEnd =
      sizeInfo.size < 0 ? end : Math.min(dataStart + sizeInfo.size, end);
    if (idInfo.id === targetId) return { start: dataStart, end: dataEnd };
    if (sizeInfo.size < 0) return null;
    offset = dataEnd;
  }
  return null;
}

function readUintBE(buf: Uint8Array, offset: number, length: number): number {
  let value = 0;
  for (let i = 0; i < length; i++) value = value * 256 + buf[offset + i];
  return value;
}

function readFloatBE(
  buf: Uint8Array,
  offset: number,
  length: number,
): number | null {
  if (length !== 4 && length !== 8) return null;
  const view = new DataView(buf.buffer, buf.byteOffset + offset, length);
  return length === 4 ? view.getFloat32(0, false) : view.getFloat64(0, false);
}

const EBML_SEGMENT_ID = 0x18538067;
const EBML_INFO_ID = 0x1549a966;
const EBML_TIMECODE_SCALE_ID = 0x2ad7b1;
const EBML_DURATION_ID = 0x4489;
const WEBM_DEFAULT_TIMECODE_SCALE = 1_000_000; // ns per tick, EBML spec default
const WEBM_HEAD_BYTES = 1_048_576;

async function parseWebmDuration(file: Blob): Promise<number | null> {
  const buf = new Uint8Array(
    await file.slice(0, Math.min(WEBM_HEAD_BYTES, file.size)).arrayBuffer(),
  );
  const segment = findChildElement(buf, 0, buf.length, EBML_SEGMENT_ID);
  if (!segment) return null;
  const info = findChildElement(buf, segment.start, segment.end, EBML_INFO_ID);
  if (!info) return null;

  const timecodeScaleEl = findChildElement(
    buf,
    info.start,
    info.end,
    EBML_TIMECODE_SCALE_ID,
  );
  const timecodeScale = timecodeScaleEl
    ? readUintBE(
        buf,
        timecodeScaleEl.start,
        timecodeScaleEl.end - timecodeScaleEl.start,
      )
    : WEBM_DEFAULT_TIMECODE_SCALE;

  const durationEl = findChildElement(
    buf,
    info.start,
    info.end,
    EBML_DURATION_ID,
  );
  if (!durationEl) return null;
  const ticks = readFloatBE(
    buf,
    durationEl.start,
    durationEl.end - durationEl.start,
  );
  if (ticks == null) return null;
  return (ticks * timecodeScale) / 1e9;
}

// Walks top-level ISO-BMFF boxes ([4-byte size][4-byte type][payload], with
// a 64-bit "largesize" when size === 1) looking for `targetType`, skipping
// every other box - crucially including a multi-gigabyte "mdat" - by its
// declared size alone, never reading its payload.
async function findBox(
  file: Blob,
  start: number,
  end: number,
  targetType: string,
): Promise<{ offset: number; size: number } | null> {
  let offset = start;
  while (offset < end) {
    const header = new Uint8Array(
      await file.slice(offset, offset + 8).arrayBuffer(),
    );
    if (header.length < 8) return null;
    const view = new DataView(header.buffer);
    let size = view.getUint32(0, false);
    const type = String.fromCharCode(
      header[4],
      header[5],
      header[6],
      header[7],
    );
    let headerSize = 8;
    if (size === 1) {
      const ext = new Uint8Array(
        await file.slice(offset + 8, offset + 16).arrayBuffer(),
      );
      if (ext.length < 8) return null;
      const extView = new DataView(ext.buffer);
      size =
        extView.getUint32(0, false) * 2 ** 32 + extView.getUint32(4, false);
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < headerSize) return null;
    if (type === targetType)
      return { offset: offset + headerSize, size: size - headerSize };
    offset += size;
  }
  return null;
}

async function parseMp4Duration(file: Blob): Promise<number | null> {
  const moov = await findBox(file, 0, file.size, "moov");
  if (!moov) return null;
  const mvhd = await findBox(
    file,
    moov.offset,
    moov.offset + moov.size,
    "mvhd",
  );
  if (!mvhd) return null;

  const buf = new Uint8Array(
    await file
      .slice(mvhd.offset, mvhd.offset + Math.min(mvhd.size, 32))
      .arrayBuffer(),
  );
  if (buf.length < 4) return null;
  const view = new DataView(buf.buffer);
  const version = buf[0];
  if (version === 1) {
    if (buf.length < 32) return null;
    const timescale = view.getUint32(20, false);
    if (!timescale) return null;
    const duration =
      view.getUint32(24, false) * 2 ** 32 + view.getUint32(28, false);
    return duration / timescale;
  }
  if (buf.length < 20) return null;
  const timescale = view.getUint32(12, false);
  if (!timescale) return null;
  return view.getUint32(16, false) / timescale;
}

export async function parseDuration(
  file: Blob,
  ext: string,
): Promise<number | null> {
  try {
    if (ext === "mp4" || ext === "mov") return await parseMp4Duration(file);
    if (ext === "webm") return await parseWebmDuration(file);
    return null;
  } catch {
    return null;
  }
}

// ponytail: self-check with synthetic minimal boxes, run via
// `tsx worker/video-duration.ts` - no fixture files, no test runner.
async function demo() {
  const assert = await import("node:assert/strict");

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
  assert.strictEqual(await parseDuration(mp4, "mp4"), 5);

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
  assert.strictEqual(await parseDuration(mp4TrailingMoov, "mp4"), 5);

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
  assert.strictEqual(await parseDuration(webm, "webm"), 2.5);

  assert.strictEqual(
    await parseDuration(new Blob([new Uint8Array(4)]), "mp4"),
    null,
  );

  console.log("video-duration: all checks passed");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  demo();
}
