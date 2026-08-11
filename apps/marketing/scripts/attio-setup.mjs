// Creates the Attio list attributes the lead forms write to.
// Run once, safe to re-run — attributes that already exist are reported and skipped.
//
//   ATTIO_API_KEY=... node scripts/attio-setup.mjs
//
// The api_slugs below MUST match the entry_values keys in app/actions/*.ts, and the
// list ids must match LISTS in lib/attio.ts. Everything is plain text on purpose:
// a `select` rejects an option that doesn't exist yet, which would turn "we added a
// new CTA" into "we silently stopped capturing leads".

const SCHEMA = {
  // enterprise
  "bbc0dafa-b994-4d02-a2ba-31fd67366db4": [
    ["company", "Company", "Company name as typed in the form"],
    ["team_size", "Team size", "1-10, 11-50, 51-200, 201+"],
    ["monthly_volume", "Monthly volume", "<10k, 10k-100k, 100k-1m, 1m+"],
    ["message", "Message", "Free-text message from the form"],
  ],
};

const key = process.env.ATTIO_API_KEY;
if (!key) {
  console.error("ATTIO_API_KEY is not set");
  process.exit(1);
}

let failed = false;

for (const [list, attributes] of Object.entries(SCHEMA)) {
  for (const [api_slug, title, description] of attributes) {
    const res = await fetch(`https://api.attio.com/v2/lists/${list}/attributes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: {
          title,
          description,
          api_slug,
          type: "text",
          is_required: false,
          is_unique: false,
          is_multiselect: false,
          config: {},
          default_value: null,
        },
      }),
    });

    const body = await res.text();
    if (res.ok) {
      console.log(`✓ ${api_slug} created on ${list}`);
    } else if (res.status === 409 || body.includes("slug_conflict")) {
      console.log(`· ${api_slug} already exists on ${list}`);
    } else {
      console.error(`✗ ${api_slug} on ${list} → ${res.status} ${body}`);
      failed = true;
    }
  }
}

process.exit(failed ? 1 : 0);
