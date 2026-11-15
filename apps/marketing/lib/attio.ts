import { notify } from "./push";

const API = "https://api.attio.com/v2";

/**
 * Attio list ids — the `collection/<uuid>` segment of the list URL in the app
 * (the `view/<uuid>` that follows it is just a saved view, not the list).
 * The API takes a UUID or an api_slug here; UUIDs don't change if the list is renamed.
 */
export const LISTS = {
  // The old cloud waitlist list (61d300eb-…) still exists in Attio with its
  // historical leads, but nothing writes to it since the public alpha opened.
  enterprise: "bbc0dafa-b994-4d02-a2ba-31fd67366db4",
} as const;

type Kind = keyof typeof LISTS;

/**
 * ATTIO_API_KEY must be a *Worker secret* (`wrangler secret put ATTIO_API_KEY`).
 * Build-time env in CI never reaches the Worker — Next.js only inlines NEXT_PUBLIC_*.
 */
async function call(method: "PUT" | "POST", path: string, data: unknown) {
  const key = process.env.ATTIO_API_KEY;
  if (!key) {
    throw new Error(
      "ATTIO_API_KEY is not set — refusing to accept a lead we cannot record"
    );
  }

  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ data }),
  });

  if (!res.ok) {
    throw new Error(`Attio ${method} ${path} → ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/**
 * Upserts the person by email, then adds them to `list` (an Attio list slug or id).
 * Both calls are PUT upserts, so a second signup updates the record instead of
 * duplicating it.
 *
 * `entryValues` keys are attribute api_slugs on the list — create them with
 * `scripts/attio-setup.mjs`. Every attribute is plain text on purpose: a `select`
 * rejects an option that doesn't exist yet, which would turn "we added a new CTA"
 * into "we silently stopped capturing leads".
 */
export async function captureLead(
  email: string,
  list: string,
  entryValues: Record<string, string> = {}
) {
  const person = await call(
    "PUT",
    "/objects/people/records?matching_attribute=email_addresses",
    { values: { email_addresses: [{ email_address: email }] } }
  );

  await call("PUT", `/lists/${list}/entries`, {
    parent_object: "people",
    parent_record_id: person.data.id.record_id,
    entry_values: entryValues,
  });

  // Ping only once the lead is safely in Attio, so a notification always means a
  // recorded lead. `web_url` is Attio's own link to the record; skipped if absent.
  const kind = Object.keys(LISTS).find((k) => LISTS[k as Kind] === list) ?? "lead";
  await notify(
    `New ${kind} lead`,
    [email, ...Object.entries(entryValues).map(([k, v]) => `${k}: ${v}`)].join("\n"),
    person.data.web_url
  );
}
