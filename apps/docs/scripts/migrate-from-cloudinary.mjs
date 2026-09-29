#!/usr/bin/env node
// Copies every asset of a Cloudinary account into Openinary, keeping each
// public_id as the storage path: "avatars/jane" (png) lands at "avatars/jane.png".
//
//   node migrate-from-cloudinary.mjs [--dry-run] [--prefix=folder/]
//
// Node 18+, no dependencies. Every asset is appended to the log as it goes,
// so a re-run skips what already made it and resumes where it stopped.
// Guide: https://docs.openinary.dev/migrate-from-cloudinary

import { appendFileSync, existsSync, readFileSync } from "node:fs";

const env = process.env;
for (const name of [
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "OPENINARY_API_KEY",
]) {
  if (!env[name]) {
    console.error(`Missing ${name}. See the guide linked at the top of this file.`);
    process.exit(1);
  }
}

const CLOUDINARY_API = env.CLOUDINARY_API_URL ?? "https://api.cloudinary.com";
const OPENINARY_URL = (env.OPENINARY_URL ?? "https://cdn.openinary.dev").replace(/\/+$/, "");
const LOG = env.MIGRATION_LOG ?? "cloudinary-migration.jsonl";
const CONCURRENCY = 4;
const dryRun = process.argv.includes("--dry-run");
const prefix = process.argv.find((a) => a.startsWith("--prefix="))?.slice(9) ?? "";

// What Openinary accepts on upload. Anything else is logged as "unsupported".
const SUPPORTED = new Set([
  "jpg", "jpeg", "png", "webp", "avif", "gif", "heic", "heif", "psd",
  "mp4", "mov", "webm", "wav", "mp3", "ogg", "glb", "gltf",
]);

const cloudinaryAuth = `Basic ${Buffer.from(
  `${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`,
).toString("base64")}`;

const done = new Set(
  existsSync(LOG)
    ? readFileSync(LOG, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .filter((entry) => entry.status === "ok")
        .map((entry) => entry.from)
    : [],
);
const counts = { ok: 0, skipped: 0, unsupported: 0, failed: 0 };

function record(entry) {
  counts[entry.status]++;
  if (!dryRun) appendFileSync(LOG, `${JSON.stringify(entry)}\n`);
  if (entry.status !== "ok") console.log(`${entry.status}: ${entry.path} ${entry.error ?? ""}`);
}

// Only delivery type "upload": private and authenticated assets are left out.
async function* listAssets(resourceType) {
  let cursor;
  do {
    const url = new URL(
      `${CLOUDINARY_API}/v1_1/${env.CLOUDINARY_CLOUD_NAME}/resources/${resourceType}/upload`,
    );
    url.searchParams.set("max_results", "500");
    if (prefix) url.searchParams.set("prefix", prefix);
    if (cursor) url.searchParams.set("next_cursor", cursor);
    const res = await fetch(url, { headers: { Authorization: cloudinaryAuth } });
    if (!res.ok) throw new Error(`Cloudinary answered ${res.status}: ${await res.text()}`);
    const page = await res.json();
    yield page.resources;
    cursor = page.next_cursor;
  } while (cursor);
}

async function migrate(asset) {
  const from = asset.secure_url;
  // Raw assets carry their extension in the public_id and have no format.
  const path = asset.format ? `${asset.public_id}.${asset.format}` : asset.public_id;
  if (done.has(from)) return void counts.skipped++;
  if (!SUPPORTED.has(path.split(".").pop().toLowerCase())) {
    return record({ from, path, status: "unsupported" });
  }
  if (dryRun) return record({ from, path, status: "ok" });

  try {
    const original = await fetch(from);
    if (!original.ok) throw new Error(`download answered ${original.status}`);

    const slash = path.lastIndexOf("/");
    const form = new FormData();
    if (slash !== -1) form.set("folder", path.slice(0, slash));
    form.append("files", await original.blob(), path.slice(slash + 1));

    const res = await fetch(`${OPENINARY_URL}/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENINARY_API_KEY}` },
      body: form,
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 402) {
      console.error(`\nPlan limit reached (${body.feature ?? "quota"}). Raise it, then run this again to resume.`);
      process.exit(1);
    }
    const uploaded = body.files?.[0];
    if (!uploaded) throw new Error(body.errors?.[0]?.error ?? body.error ?? `upload answered ${res.status}`);
    record({ from, path: uploaded.path, to: `${OPENINARY_URL}${uploaded.url}`, status: "ok" });
  } catch (error) {
    record({ from, path, status: "failed", error: error.message });
  }
}

for (const resourceType of ["image", "video", "raw"]) {
  for await (const assets of listAssets(resourceType)) {
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (assets.length) await migrate(assets.shift());
      }),
    );
    console.log(`${counts.ok} copied, ${counts.skipped} already done, ${counts.unsupported} unsupported, ${counts.failed} failed`);
  }
}

console.log(dryRun ? "\nDry run, nothing was uploaded." : `\nDone. Every asset is listed in ${LOG}.`);
if (counts.failed) process.exitCode = 1;
