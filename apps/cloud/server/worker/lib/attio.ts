// Attio (CRM) - just enough of the REST API for the admin panel, over plain
// fetch. No SDK: three endpoints, all POST-a-filter-get-a-list, and the
// Worker has no room for a client library that would only wrap that.
//
// Read and delete only. Nothing here writes CRM state back - marking a
// waitlist entry "converted" would need a status attribute that doesn't exist
// on the list yet, and inventing one from this side would be a schema change
// made by a side effect.

const API = "https://api.attio.com/v2";

/** The `people` list new cloud sign-ups land on. */
const WAITLIST_SLUG = "cloud_waitlist";

/**
 * Every call funnels through here so an unset key is one branch rather than a
 * guard in each function: local dev has no CRM, and the admin panel has to
 * stay usable without one. Callers treat null as "no CRM configured", which
 * they render the same way as "this person isn't in the CRM".
 */
async function attio<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T | null> {
  const key = process.env.ATTIO_API_KEY;
  if (!key) return null;

  const response = await fetch(`${API}${path}`, {
    method: init?.method ?? "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!response.ok) {
    throw new Error(
      `Attio ${path} failed (${response.status}): ${await response.text()}`,
    );
  }
  // 200 with an empty object is what DELETE answers.
  return (await response.json()) as T;
}

// --- response shapes, narrowed to what's read below ---

/** Attio returns every attribute as a list of historical values, newest first. */
type AttrValues = Record<string, unknown[] | undefined>;

type AttioRecord = {
  id: { record_id: string };
  values: AttrValues;
  created_at?: string;
};

type AttioEntry = {
  id: { entry_id: string };
  parent_record_id: string;
  created_at?: string;
  entry_values?: AttrValues;
};

function firstValue(values: AttrValues, attribute: string): unknown {
  return values[attribute]?.[0];
}

function readString(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object") return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : null;
}

export type AttioPerson = {
  recordId: string;
  name: string | null;
  email: string | null;
  createdAt: string | null;
  /** Deep link to the record, so the admin fiche can hand off to the CRM. */
  url: string;
};

function shapePerson(record: AttioRecord): AttioPerson {
  return {
    recordId: record.id.record_id,
    name: readString(firstValue(record.values, "name"), "full_name"),
    email: readString(
      firstValue(record.values, "email_addresses"),
      "email_address",
    ),
    createdAt: record.created_at ?? null,
    url: `https://app.attio.com/_/person/${record.id.record_id}`,
  };
}

/**
 * The person behind an account, matched on the email they signed up with.
 * Null when there is no CRM configured or no matching record - the admin fiche
 * renders both the same way, because both mean "nothing to show here".
 */
export async function findPersonByEmail(
  email: string,
): Promise<AttioPerson | null> {
  const result = await attio<{ data: AttioRecord[] }>(
    "/objects/people/records/query",
    { body: { filter: { email_addresses: email }, limit: 1 } },
  );
  const record = result?.data[0];
  return record ? shapePerson(record) : null;
}

/**
 * The cloud waitlist, newest first - the queue the admin panel grants early
 * access from.
 *
 * Two round trips rather than one: the entries endpoint returns parent record
 * ids, not the people themselves, so the names and emails come from a second
 * lookup. ponytail: fine at waitlist scale (one page), revisit if the list
 * ever needs real pagination.
 */
export async function listWaitlist(limit = 100): Promise<AttioPerson[]> {
  const entries = await attio<{ data: AttioEntry[] }>(
    `/lists/${WAITLIST_SLUG}/entries/query`,
    {
      body: { limit, sorts: [{ direction: "desc", attribute: "created_at" }] },
    },
  );
  const recordIds = entries?.data.map((entry) => entry.parent_record_id) ?? [];
  if (recordIds.length === 0) return [];

  const people = await attio<{ data: AttioRecord[] }>(
    "/objects/people/records/query",
    { body: { filter: { record_id: { $in: recordIds } }, limit } },
  );
  const byId = new Map(
    (people?.data ?? []).map((record) => [record.id.record_id, record]),
  );
  // Driven by the entry order so the waitlist stays in the order Attio sorted
  // it, and a record that has since been deleted just drops out.
  return recordIds
    .map((id) => byId.get(id))
    .filter((record): record is AttioRecord => record !== undefined)
    .map(shapePerson);
}

/** Drops a person from the CRM. Part of deleting an account everywhere. */
export async function deletePerson(recordId: string): Promise<void> {
  await attio(`/objects/people/records/${recordId}`, { method: "DELETE" });
}
