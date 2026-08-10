// Self-check for lib/push.ts — run with `node scripts/push-check.mjs`.
// Stubs fetch, so it never talks to Telegram and needs no credentials.
import assert from "node:assert/strict";
import { notify } from "../lib/push.ts";

let sent = null;
globalThis.fetch = async (url, init) => {
  sent = { url, body: init.body };
  return { ok: true, status: 200, text: async () => "" };
};

const run = async (env, ...args) => {
  sent = null;
  // `delete`, not `= undefined`: assigning undefined to process.env stores the
  // *string* "undefined", which is truthy and would fake a credential into place.
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
  Object.assign(process.env, env);
  await notify(...args);
  return sent;
};

const creds = { TELEGRAM_BOT_TOKEN: "123:abc", TELEGRAM_CHAT_ID: "42" };

// A missing credential must not throw and must not fire a request: the lead is
// already in Attio, and this path must never be able to cost a signup.
assert.equal(await run({}, "t", "b"), null);
assert.equal(await run({ TELEGRAM_BOT_TOKEN: "123:abc" }, "t", "b"), null);

const ok = await run(
  creds,
  "New waitlist lead",
  "a@b.com\nsource: hero",
  "https://app.attio.com/x/person/1"
);
assert.equal(ok.url, "https://api.telegram.org/bot123:abc/sendMessage");
assert.equal(ok.body.get("chat_id"), "42");
assert.equal(ok.body.get("parse_mode"), "HTML");
assert.equal(
  ok.body.get("text"),
  '<b>New waitlist lead</b>\na@b.com\nsource: hero\n<a href="https://app.attio.com/x/person/1">Open in Attio</a>'
);

// No Attio web_url on the upsert response → still notify, just without the link.
const noLink = await run(creds, "New lead", "a@b.com");
assert.equal(noLink.body.get("text"), "<b>New lead</b>\na@b.com");

// A company name is attacker-controlled and lands in Telegram's HTML parser.
// Unescaped, this 400s and the notification is lost.
const injected = await run(creds, "New enterprise lead", "company: <b>R&D</b> <script>");
assert.equal(
  injected.body.get("text"),
  "<b>New enterprise lead</b>\ncompany: &lt;b&gt;R&amp;D&lt;/b&gt; &lt;script&gt;"
);

console.log("push-check: all assertions passed");
