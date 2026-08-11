// Turns api/scripts/loops-sequences.ts into Loops workflows.
//
//   pnpm tsx api/scripts/loops-build.ts --properties   # once, before the first build
//   pnpm tsx api/scripts/loops-build.ts --dry-run      # what it would do
//   pnpm tsx api/scripts/loops-build.ts                # build what is missing
//   pnpm tsx api/scripts/loops-build.ts --copy         # ALSO overwrite live copy
//
// Three modes, decided per sequence by what is already in the account:
//
//   new     - creates the workflow and every node, then leaves it in Draft.
//   empty   - a workflow exists under this name but has no emails at all, so a
//             previous run died partway. Finishes it in place.
//   exists  - left alone, unless --copy is passed.
//
// That last default is the important one. Copy is edited in the Loops UI, where
// the preview is, and Loops rewrites what it stores anyway (it expands <Style />
// to every default and inserts spacer paragraphs), so the live version is the
// real one and this file's `lmx` is only the seed a workflow was built from.
// Overwriting it silently on an unrelated run costs work that exists nowhere
// else - hence --copy, which is the "yes, this file wins" switch.
//
// Structural edits are the other half. Editing a live graph can strand the
// contacts queued inside it, and Loops offers no atomic "replace this
// workflow", so a new step, a different delay or a changed filter means either
// deleting the workflow in the Loops UI and running this again, or patching the
// specific nodes over the API while the workflow is still in Draft.
//
// The second mode exists because Loops has no endpoint to delete a workflow:
// without it, one failed request halfway through a build leaves something only
// a human can clear up. Every call also retries on 429, which a full build
// reliably provokes.
//
// Event triggers need their event to exist before the trigger can name it, and
// event patterns are read-only over the API - the only way to register one is
// to send that event once. If a build fails with "No event pattern exists for
// this event name", POST it to /v1/events/send against a throwaway address and
// delete that contact afterwards.
//
// Nothing here publishes. Loops has no API for Draft -> Sending, so the last
// step of every build is a human opening the workflow and pressing Publish -
// which is no bad place for a pair of eyes anyway.

import "dotenv/config";
import {
  CONTACT_PROPERTIES,
  type Filter,
  SENDER,
  SEQUENCES,
  type Sequence,
  type Trigger,
} from "./loops-sequences.js";

const API = "https://app.loops.so/api/v1";

const dryRun = process.argv.includes("--dry-run");
/** Opt in to overwriting live email content from this file. See the header. */
const overwriteCopy = process.argv.includes("--copy");

type Json = Record<string, unknown>;

/** Loops node graph, narrowed to the fields this script reads. */
type SimplifiedWorkflow = {
  id: string;
  workflowRevisionId: string | null;
  rootNodeId: string;
  nodes: Record<
    string,
    { typeName: string; nextNodeIds: string[]; emailMessageId?: string }
  >;
};

/**
 * Named, and used as annotations rather than only as type arguments, at the
 * two calls inside the build loop. Each of those reads the revision token and
 * then writes the next one back to the same variable, and on the second
 * iteration TypeScript reads that as a variable whose type depends on itself.
 */
type Revision = { workflowRevisionId: string };

type CreatedNode = {
  node: { id: string; emailMessageId?: string };
  workflow: SimplifiedWorkflow;
};

/**
 * Loops allows ten requests a second, and a full build is several hundred sent
 * as fast as they can be awaited, so a 429 partway through is the normal case
 * rather than the exceptional one. Backing off and retrying is cheaper than
 * pacing every call: the limit is only reachable during a build, and a build
 * that takes a few seconds longer costs nothing.
 */
const RETRIES = 6;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function loops<T>(
  path: string,
  init: { method?: "GET" | "POST" | "PUT"; body?: unknown } = {},
  attempt = 1,
): Promise<T> {
  const key = process.env.LOOPS_API_KEY;
  if (!key) throw new Error("LOOPS_API_KEY is not set");

  const response = await fetch(`${API}${path}`, {
    method: init.method ?? "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (response.status === 429 && attempt <= RETRIES) {
    // 0.5s, 1s, 2s, ... - the window is one second, so the first backoff
    // already clears it and the rest are there for a busy account.
    await sleep(250 * 2 ** attempt);
    return loops<T>(path, init, attempt + 1);
  }
  if (!response.ok) {
    const detail = await response.text();
    // 401 on a key that works elsewhere means one thing, and it costs an hour
    // to work out from "Unauthorized" alone.
    const hint =
      response.status === 401 && path.startsWith("/workflows")
        ? " (the workflow API has to be enabled for the team - ask Loops support)"
        : "";
    throw new Error(
      `Loops ${path} failed (${response.status})${hint}: ${detail}`,
    );
  }
  return (await response.json()) as T;
}

// --- contact properties ----------------------------------------------------

/**
 * Loops rejects an audience filter that names a property it doesn't know, so
 * these come first. Re-creating one that exists is a 409, which is success as
 * far as this script is concerned.
 */
async function createProperties(): Promise<void> {
  for (const property of CONTACT_PROPERTIES) {
    if (dryRun) {
      console.log(
        `  would create property ${property.name} (${property.type})`,
      );
      continue;
    }
    try {
      await loops("/contacts/properties", { body: property });
      console.log(`  created ${property.name}`);
    } catch (error) {
      const message = String(error);
      if (message.includes("(409)") || message.includes("already")) {
        console.log(`  ${property.name} already exists`);
        continue;
      }
      throw error;
    }
  }
}

// --- graph helpers ---------------------------------------------------------

/**
 * The nodes between the trigger and the exit, in the order a contact walks
 * them. The API hands back an unordered map, and both building and rewriting
 * need "the third email", not "some email".
 *
 * Every sequence here is a straight line, so following the first outgoing edge
 * is the whole traversal. A branch added by hand in the UI would make this
 * walk one side and quietly ignore the other, which is the other half of why
 * structural edits belong in this file rather than in the editor.
 */
function walk(workflow: SimplifiedWorkflow): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  let current: string | undefined = workflow.rootNodeId;
  while (current && !seen.has(current)) {
    seen.add(current);
    order.push(current);
    current = workflow.nodes[current]?.nextNodeIds[0];
  }
  return order;
}

function exitNodeId(workflow: SimplifiedWorkflow): string {
  const id = walk(workflow).find(
    (nodeId) => workflow.nodes[nodeId]?.typeName === "ExitAction",
  );
  if (!id) throw new Error(`No exit node in workflow ${workflow.id}`);
  return id;
}

function triggerPayload(trigger: Trigger, reEligible: boolean): Json {
  switch (trigger.type) {
    // No reEligible: you only sign up once, and the API rejects the field.
    case "signup":
      return { typeName: "SignupTrigger" };
    case "event":
      return {
        typeName: "EventTrigger",
        eventName: trigger.eventName,
        reEligible,
      };
    case "property":
      return {
        typeName: "ContactPropertyTrigger",
        contactPropertyQuery: {
          key: trigger.key,
          is: trigger.is,
          was: trigger.was,
        },
        reEligible,
      };
  }
}

/** Resolves the "@self" placeholder in activity conditions to this workflow. */
function resolveFilter(filter: Filter, workflowId: string): Filter {
  return {
    match: filter.match,
    conditions: filter.conditions.map((condition) =>
      condition.type === "activity" && condition.id === "@self"
        ? { ...condition, id: workflowId }
        : condition,
    ),
  };
}

// --- building --------------------------------------------------------------

async function build(sequence: Sequence): Promise<void> {
  const workflow = await loops<SimplifiedWorkflow>("/workflows", {
    body: { name: sequence.name, description: sequence.description },
  });
  console.log(`  created workflow ${workflow.id}`);
  await populate(sequence, workflow);
}

/**
 * Configures the trigger and appends every node. Separate from build() so an
 * interrupted build can be finished in place: Loops has no endpoint to delete
 * a workflow, so a run that dies halfway leaves one behind that can only be
 * cleaned up by hand in the UI. Pointing this at it instead is the difference
 * between "re-run" and "go and click delete first".
 */
async function populate(
  sequence: Sequence,
  workflow: SimplifiedWorkflow,
): Promise<void> {
  // Only the revision moves. The id and the exit node are fixed for the life
  // of the build - every node is inserted before that same exit - so nothing
  // else needs to be re-read from each response.
  const { id: workflowId, rootNodeId } = workflow;
  const exit = exitNodeId(workflow);
  let revision: string | null = workflow.workflowRevisionId;

  const trigger: Revision = await loops<Revision>(
    `/workflows/${workflowId}/nodes/${rootNodeId}`,
    {
      body: {
        expectedRevisionId: revision,
        payload: triggerPayload(sequence.trigger, sequence.reEligible),
      },
    },
  );
  revision = trigger.workflowRevisionId;
  console.log(`  trigger: ${sequence.trigger.type}`);

  // Each node is inserted immediately before the exit, so appending in source
  // order builds the ladder top to bottom.
  for (const step of sequence.steps) {
    const nodeTypeName =
      "wait" in step
        ? "TimerAction"
        : "filter" in step
          ? "AudienceFilter"
          : "SendEmailAction";

    const created: CreatedNode = await loops<CreatedNode>(
      `/workflows/${workflowId}/nodes`,
      {
        body: {
          insertMode: "before",
          beforeNodeId: exit,
          expectedRevisionId: revision,
          nodeTypeName,
        },
      },
    );
    revision = created.workflow.workflowRevisionId;

    if ("wait" in step) {
      const updated: Revision = await loops<Revision>(
        `/workflows/${workflowId}/nodes/${created.node.id}`,
        { body: { expectedRevisionId: revision, payload: step.wait } },
      );
      revision = updated.workflowRevisionId;
      console.log(`  wait ${step.wait.amount}${step.wait.unit}`);
      continue;
    }

    if ("filter" in step) {
      const updated: Revision = await loops<Revision>(
        `/workflows/${workflowId}/nodes/${created.node.id}`,
        {
          body: {
            expectedRevisionId: revision,
            payload: {
              audienceFilter: resolveFilter(step.filter, workflowId),
              // Each rung re-asks its own question; see the note on Step.
              appliesDownstream: false,
            },
          },
        },
      );
      revision = updated.workflowRevisionId;
      console.log(`  filter (${step.filter.conditions.length} condition(s))`);
      continue;
    }

    // Creating the node creates an empty email message with it; the content
    // goes through the email-message API, not the node.
    const emailMessageId = created.node.emailMessageId;
    if (!emailMessageId) {
      throw new Error(`No emailMessageId on node ${created.node.id}`);
    }
    await writeEmail(emailMessageId, step.email);
    console.log(`  email "${step.email.subject}"`);
  }
}

/**
 * Email content is versioned separately from the graph: its revision token is
 * `contentRevisionId`, not the workflow's. Read it back rather than tracking
 * it, since a rewrite may be picking up an email this script didn't create.
 */
async function writeEmail(
  emailMessageId: string,
  email: { subject: string; previewText: string; format: string; lmx: string },
): Promise<void> {
  const current = await loops<{ contentRevisionId: string | null }>(
    `/email-messages/${emailMessageId}`,
    { method: "GET" },
  );
  await loops(`/email-messages/${emailMessageId}`, {
    body: {
      expectedRevisionId: current.contentRevisionId,
      subject: email.subject,
      previewText: email.previewText,
      emailFormat: email.format,
      lmx: email.lmx,
      ...SENDER,
    },
  });
}

/**
 * Copy-only update of a workflow that already exists. Pairs the emails in this
 * file with the SendEmailAction nodes in the live graph, positionally. A
 * mismatch means the graph has drifted from this file, and guessing which
 * email belongs where would silently send the wrong one, so it stops.
 */
async function rewrite(sequence: Sequence, workflowId: string): Promise<void> {
  const workflow = await loops<SimplifiedWorkflow>(`/workflows/${workflowId}`, {
    method: "GET",
  });
  const liveEmails = walk(workflow)
    .map((nodeId) => workflow.nodes[nodeId])
    .filter((node) => node?.typeName === "SendEmailAction");
  const wanted = sequence.steps.flatMap((step) =>
    "email" in step ? [step.email] : [],
  );

  // No emails at all is not a workflow anyone has been running; it is a build
  // that died between "create" and "add the first node". Unambiguous, so
  // finish it rather than asking for a manual delete that the API cannot do.
  if (liveEmails.length === 0 && wanted.length > 0) {
    console.log("  empty graph: finishing an interrupted build");
    await populate(sequence, workflow);
    return;
  }

  // Anything past here overwrites copy that was very likely edited in Loops,
  // and there is no undo on the other side.
  if (!overwriteCopy) {
    console.log(
      `  exists (${liveEmails.length} email(s)): left alone. --copy to overwrite from this file.`,
    );
    return;
  }

  if (liveEmails.length !== wanted.length) {
    console.log(
      `  SKIPPED: ${liveEmails.length} email(s) live, ${wanted.length} in this file.\n` +
        "  The graph has drifted. Delete the workflow in Loops and re-run to rebuild it.",
    );
    return;
  }

  for (const [index, email] of wanted.entries()) {
    const emailMessageId = liveEmails[index]?.emailMessageId;
    if (!emailMessageId)
      throw new Error(`No emailMessageId at position ${index}`);
    await writeEmail(emailMessageId, email);
    console.log(`  updated "${email.subject}"`);
  }
}

// --- entry point -----------------------------------------------------------

async function main() {
  if (process.argv.includes("--properties")) {
    console.log("Contact properties:");
    await createProperties();
    console.log();
  }

  // One page covers every workflow this account will ever have by hand; 50 is
  // the API's maximum per page.
  //
  // Skipped when a dry run has no key, so the plan can be read before anyone
  // hands one over. Everything then reports as new, which is what a first run
  // against an empty account would do anyway.
  const offline = dryRun && !process.env.LOOPS_API_KEY;
  if (offline) console.log("No LOOPS_API_KEY: showing a first build.\n");
  const existing = offline
    ? []
    : (
        await loops<{ data: Array<{ id: string; name: string }> }>(
          "/workflows?perPage=50",
          { method: "GET" },
        )
      ).data;
  const byName = new Map(existing.map((item) => [item.name, item.id]));

  for (const sequence of SEQUENCES) {
    const live = byName.get(sequence.name);
    console.log(`${sequence.name}${live ? ` (${live})` : " (new)"}`);

    if (dryRun) {
      const emails = sequence.steps.filter((step) => "email" in step).length;
      console.log(
        live
          ? overwriteCopy
            ? `  would OVERWRITE ${emails} live email(s) from this file`
            : "  exists: would leave alone"
          : `  would create ${sequence.steps.length} node(s), ${emails} email(s)`,
      );
      continue;
    }

    if (live) await rewrite(sequence, live);
    else await build(sequence);
    console.log();
  }

  if (!dryRun) {
    console.log(
      "Done. Every new workflow is in Draft: open it in Loops and press Publish.\n" +
        "There is no API for that step.",
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
