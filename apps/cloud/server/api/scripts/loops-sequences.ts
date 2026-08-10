// The lifecycle sequences, as data. loops-build.ts turns this file into Loops
// workflows; nothing here runs at request time.
//
// Why a file rather than the Loops editor: a sequence is six decisions (who
// enters, how long the gaps are, who gets skipped, what each email says) and
// the editor only shows you one of them at a time. Here the whole ladder is
// one screen, it diffs in review, and rebuilding it after a mistake is one
// command instead of an afternoon of dragging nodes.
//
// The filters read contact properties that api/lib/loops.ts pushes daily, so
// "still hasn't made a bucket" is answered by the same numbers the customer
// sees in their own dashboard. Keep the two files in step: a property renamed
// here and not there produces a filter that silently matches nobody.

/** Who enters the sequence. */
export type Trigger =
  /** Contact created in Loops, which api/lib/auth.ts does on signup. */
  | { type: "signup" }
  /** Named event from trackContact in api/lib/loops.ts. */
  | { type: "event"; eventName: string }
  /**
   * A contact property changing from `was` to `is`. Both sides are required.
   *
   * Careful: trigger comparisons and audience filters use two different
   * operator vocabularies. Here it is snake_case and narrower ("equal",
   * "not_equal", "greater_than", "numeric_equal"); in Filter below it is
   * camelCase ("equals", "notEquals", "greaterThan"). Mixing them up is a 400,
   * which is at least loud.
   */
  | {
      type: "property";
      key: string;
      is: { operator: string; value: unknown };
      was: { operator: string; value: unknown };
    };

/** A Loops audience filter, in the API's own shape - see AudienceFilter. */
export type Filter = {
  match: "all" | "any";
  conditions: Array<
    | { type: "property"; key: string; operator: string; value?: unknown }
    | {
        type: "activity";
        action: "sent" | "opened" | "clicked";
        negate: boolean;
        target: "campaign" | "workflow" | "workflowEmail";
        /** "@self" resolves to the workflow being built. */
        id: string;
      }
  >;
};

export type Step =
  | { wait: { amount: number; unit: "m" | "h" | "d" } }
  /**
   * A gate, not a conditional send: a contact who does not match is dropped
   * out of the workflow, not skipped past this one step. That is why the three
   * activation nudges are three workflows rather than one - see the note there
   * before merging them back.
   *
   * Always built with `appliesDownstream: false`, so the check runs once, when
   * the contact reaches it. The alternative re-runs it at every later node and
   * would drop someone the moment the thing we nudged them about got done,
   * which is the opposite of what these sequences want.
   */
  | { filter: Filter }
  | {
      email: {
        subject: string;
        previewText: string;
        /**
         * "plain" for the founder notes, which are meant to read like a person
         * typed them into a mail client and to be replied to. "styled" for the
         * two upgrade sequences and the paid welcome, where a benefit list and
         * a button are the point.
         */
        format: "plain" | "styled";
        lmx: string;
      };
    };

export type Sequence = {
  name: string;
  description: string;
  trigger: Trigger;
  /** Whether one contact may go through the sequence more than once. */
  reEligible: boolean;
  steps: Step[];
};

const APP = "https://app.openinary.dev";
const DOCS = "https://docs.openinary.dev";

const FROM_NAME = "Florian from Openinary";
/** Username only - Loops appends the team's verified sending domain. */
const FROM_EMAIL = "florian";

export const SENDER = { fromName: FROM_NAME, fromEmail: FROM_EMAIL };

// Plain founder notes: no card, no heading, no button. A <Style /> is still
// set so the body isn't at the renderer's mercy, and links are text links
// because a big black button is the thing that makes an email look sent by a
// company rather than a person.
const PLAIN_STYLE =
  '<Style bodyColor="#ffffff" backgroundColor="#ffffff" bodyXPadding="24" bodyYPadding="24" />';

const STYLED_STYLE =
  '<Style bodyColor="#ffffff" backgroundColor="#f4f4f5" bodyXPadding="32" bodyYPadding="32" />';

const SIGNOFF = "<Paragraph>Talk soon,<Br />Florian</Paragraph>";

// --- 1. Introduction -------------------------------------------------------
//
// The only sequence that exists to get a reply rather than a click. Two
// questions, no button anywhere, one link at most. Its follow-ups are gated on
// silence rather than on product usage on purpose: someone who uploaded fifty
// files and still hasn't said why they came is exactly the person worth asking
// twice.

const introduction: Sequence = {
  name: "Cloud - Introduction",
  description:
    "Founder intro on signup, then two nudges for the ones who never answered. Built from api/scripts/loops-sequences.ts.",
  trigger: { type: "signup" },
  reEligible: false,
  steps: [
    {
      email: {
        // The plainest subject there is, because the goal is a reply and this
        // is the shape a reply-worthy email has in an inbox.
        subject: "{contact.firstName}, quick question",
        previewText:
          "I built Openinary and I read every reply. Two questions, one line each.",
        format: "plain",
        lmx: `${PLAIN_STYLE}
<Paragraph>Hi {contact.firstName}, 👋</Paragraph>
<Paragraph>Florian here. I built Openinary, and I read every reply that lands at this address.</Paragraph>
<Paragraph>The short version of what it does: your images and videos stay in your own storage, and you resize, reformat or recompress them by changing the URL. No SDK to install, no re-uploading, no bill that doubles because one page did well.</Paragraph>
<Paragraph>Two questions, if you have a minute:</Paragraph>
<UnorderedList>
  <ListItem>What made you try Openinary?</ListItem>
  <ListItem>What are you hoping to ship with it?</ListItem>
</UnorderedList>
<Paragraph>One line each is plenty.</Paragraph>
${SIGNOFF}
<Paragraph>P.S. If you are moving off Cloudinary, say so and I will send you the URL mapping.</Paragraph>`,
      },
    },
    { wait: { amount: 4, unit: "d" } },
    // Nobody who has opened anything in this sequence gets the second ask. A
    // reply is invisible to Loops, so an open is the closest available proxy
    // for "this person has already heard from me".
    {
      filter: {
        match: "all",
        conditions: [
          {
            type: "activity",
            action: "opened",
            negate: true,
            target: "workflow",
            id: "@self",
          },
        ],
      },
    },
    {
      email: {
        subject: "Did I catch you at a bad time?",
        previewText:
          "Still curious what brought you to Openinary. One line is genuinely enough.",
        format: "plain",
        lmx: `${PLAIN_STYLE}
<Paragraph>Hi {contact.firstName},</Paragraph>
<Paragraph>I will only ask once more.</Paragraph>
<Paragraph>Openinary gets built out of what people tell me they are stuck on, so even a one-line answer changes what I work on next. What were you trying to solve when you created your account?</Paragraph>
<Paragraph>And if something is already broken for you, tell me that instead and I will fix it.</Paragraph>
${SIGNOFF}`,
      },
    },
    // Day 9, not day 14. INACTIVE_DAYS is 14, so the win-back sequence opens
    // with "Did we lose you?" on exactly that day for every silent signup -
    // and two "are you still there?" emails in one morning read as broken
    // automation rather than as persistence.
    { wait: { amount: 5, unit: "d" } },
    {
      email: {
        subject: "Want 20 minutes on your setup?",
        previewText:
          "Or tell me to stop and I will, no hard feelings either way. Both answers are useful.",
        format: "plain",
        lmx: `${PLAIN_STYLE}
<Paragraph>Hi {contact.firstName},</Paragraph>
<Paragraph>Last one from me on this.</Paragraph>
<Paragraph>If you have something unusual going on, heavy video, your own storage bucket, a migration off Cloudinary, I am happy to spend 20 minutes working out whether Openinary actually fits. Reply "call" and I will send you a slot.</Paragraph>
<Paragraph>And if this is not the right time, reply "stop" and I will leave you alone.</Paragraph>
${SIGNOFF}`,
      },
    },
  ],
};

// --- 2. Activation ---------------------------------------------------------
//
// Three workflows, not one, and this is the important part: a Loops audience
// filter is a gate, not a conditional send. A contact who fails one is removed
// from the workflow, so the three nudges cannot be rungs on a single ladder -
// anyone who had already uploaded would fail the first filter on day 2 and
// never reach the API-key or transformation emails, which are exactly the ones
// they still need.
//
// Split, each nudge asks its own question of its own population, and failing
// one only ends that one. Delays are absolute from signup (day 2, 6, 13) since
// nothing runs before them, and they are offset from the introduction sequence
// so the two never land on the same day.
//
// One link per email, deliberately. These go to people who are already stuck
// somewhere, and a list of options is a worse answer than the next step.
//
// All three are Free-only. Not because a paying customer with no API key does
// not need one, but because the paid welcome runs on its own clock: someone who
// upgrades on day 5 gets "Welcome aboard" and "No API key yet?" in the same
// morning, and a week later the beginner's transformation email next to "what
// should I build next?". Onboarding a customer who already bought reads as not
// knowing who they are.
//
// ponytail: three near-identical objects rather than a builder loop - they
// diverge in trigger delay, filter and all of the copy, which is everything
// they contain, so the shared part would be the word "Sequence".

const activationUpload: Sequence = {
  name: "Cloud - Activation: first upload",
  description:
    "Day 2, still nothing uploaded. Built from api/scripts/loops-sequences.ts.",
  trigger: { type: "signup" },
  reEligible: false,
  steps: [
    { wait: { amount: 2, unit: "d" } },
    {
      filter: {
        match: "all",
        conditions: [
          { type: "property", key: "plan", operator: "equals", value: "free" },
          { type: "property", key: "storageMb", operator: "equals", value: 0 },
        ],
      },
    },
    {
      email: {
        subject: "Your first bucket is still empty",
        previewText:
          "Three minutes from here to your first transformed URL. Shortest path inside.",
        format: "plain",
        lmx: `${PLAIN_STYLE}
<Paragraph>Hi {contact.firstName}, 👋</Paragraph>
<Paragraph>I noticed your first bucket is still empty.</Paragraph>
<Paragraph>The fastest way to see what Openinary does is to drop one image into the dashboard, then add a transformation to the <Code>/t/</Code> segment of the URL it hands back:</Paragraph>
<CodeBlock>https://cdn.openinary.dev/b/your-bucket/t/w_400/photo.jpg</CodeBlock>
<Paragraph>That resized version is generated on the first request and served from cache from then on.</Paragraph>
<Paragraph><Link href="${DOCS}/cloud/quickstart">The quickstart</Link> walks the whole thing in about three minutes.</Paragraph>
<Paragraph>Anything in the way? Reply to this email, it comes straight to me.</Paragraph>
${SIGNOFF}`,
      },
    },
  ],
};

const activationApiKey: Sequence = {
  name: "Cloud - Activation: API key",
  description:
    "Day 6, still no API key. Built from api/scripts/loops-sequences.ts.",
  trigger: { type: "signup" },
  reEligible: false,
  steps: [
    { wait: { amount: 6, unit: "d" } },
    {
      filter: {
        match: "all",
        conditions: [
          { type: "property", key: "plan", operator: "equals", value: "free" },
          {
            type: "property",
            key: "apiKeyCount",
            operator: "equals",
            value: 0,
          },
        ],
      },
    },
    {
      email: {
        subject: "No API key yet?",
        previewText:
          "That is the step that moves Openinary from the dashboard into your codebase.",
        format: "plain",
        lmx: `${PLAIN_STYLE}
<Paragraph>Hi {contact.firstName}, 👋</Paragraph>
<Paragraph>You have not created an API key yet.</Paragraph>
<Paragraph>That is the step that moves Openinary out of the dashboard and into your code: uploads from your backend, signed URLs, cache invalidation. You create one in your dashboard settings, and <Link href="${DOCS}/cloud/api">the Cloud API docs</Link> cover the calls you will want first.</Paragraph>
<Paragraph>Stuck on something? Reply and I will unstick you.</Paragraph>
${SIGNOFF}`,
      },
    },
  ],
};

const activationTransform: Sequence = {
  name: "Cloud - Activation: first transformation",
  description:
    "Day 13, still no transformation. Built from api/scripts/loops-sequences.ts.",
  trigger: { type: "signup" },
  reEligible: false,
  steps: [
    { wait: { amount: 13, unit: "d" } },
    {
      filter: {
        match: "all",
        conditions: [
          { type: "property", key: "plan", operator: "equals", value: "free" },
          {
            type: "property",
            key: "transformCount",
            operator: "equals",
            value: 0,
          },
          // An empty account has transformed nothing either, and this email
          // opens by telling the reader they have files. Without this they get
          // that eleven days after being told their bucket was empty - the
          // upload nudge above is the one that fits them.
          {
            type: "property",
            key: "storageMb",
            operator: "greaterThan",
            value: 0,
          },
        ],
      },
    },
    {
      email: {
        subject: "The 30-second version of Openinary",
        previewText:
          "One URL segment, and you have seen the entire point of the product. Here it is.",
        format: "plain",
        lmx: `${PLAIN_STYLE}
<Paragraph>Hi {contact.firstName}, 👋</Paragraph>
<Paragraph>You have files in Openinary but you have not transformed any of them yet, which means you have seen the storage and none of the interesting part.</Paragraph>
<Paragraph>Take any image already in your bucket and put one parameter in the <Code>/t/</Code> segment of its URL:</Paragraph>
<CodeBlock>https://cdn.openinary.dev/b/your-bucket/t/w_800/photo.jpg</CodeBlock>
<Paragraph>Openinary resizes it, picks the best format for whoever asked, and serves that same URL from cache from then on. Parameters stack with commas, so <Code>t/w_800,q_80,f_auto</Code> does width, quality and format in one go. <Link href="${DOCS}/media-transformations/overview">Every option is here</Link>.</Paragraph>
<Paragraph>Send me a real URL from your project and I will send back the transformed version that fits it.</Paragraph>
${SIGNOFF}`,
      },
    },
  ],
};

// --- 3. Win-back -----------------------------------------------------------
//
// Entered from the cloud_inactive event, which api/lib/loops.ts fires on the
// day an account crosses two weeks without a sign-in. Re-eligible, because
// going quiet twice is two separate things worth asking about.

const winback: Sequence = {
  name: "Cloud - Win-back",
  description:
    "Fires on the cloud_inactive event (14 days without a sign-in). Built from api/scripts/loops-sequences.ts.",
  trigger: { type: "event", eventName: "cloud_inactive" },
  reEligible: true,
  steps: [
    // Both conditions exist because crossedInactivity in api/lib/lifecycle.ts
    // measures dashboard sessions, which is not the same question as whether
    // the account is dead.
    //
    // plan: not opening the dashboard for two weeks is exactly what a paying
    // customer whose setup works looks like, and the reward for a product that
    // runs itself should not be "Did we lose you?" then "Should I stop emailing
    // you?".
    //
    // usagePercent: an account serving 80% of its allowance has not gone quiet,
    // it has gone headless - somebody wired the URLs into a live site and never
    // came back to look at us. It is also the threshold the near-limit event
    // fires on, so this keeps "Did we lose you?" and "You are at 88% of your
    // free limits" from arriving the same morning, which they otherwise do
    // whenever the two clocks happen to cross on the same day.
    {
      filter: {
        match: "all",
        conditions: [
          { type: "property", key: "plan", operator: "equals", value: "free" },
          {
            type: "property",
            key: "usagePercent",
            operator: "lessThan",
            value: 80,
          },
        ],
      },
    },
    {
      email: {
        subject: "Did we lose you?",
        previewText:
          "Two quiet weeks on your account. Nothing has been deleted, in case that helps.",
        format: "plain",
        lmx: `${PLAIN_STYLE}
<Paragraph>Hi {contact.firstName}, 👋</Paragraph>
<Paragraph>Your Openinary account has been quiet for a couple of weeks, so I wanted to check in.</Paragraph>
<Paragraph>Was there something that did not work the way you expected? Something missing? Something that was simply harder than it should have been?</Paragraph>
<Paragraph>Any of those is worth knowing, even if you have moved on to something else. Everything you uploaded is still exactly where you left it.</Paragraph>
${SIGNOFF}`,
      },
    },
    { wait: { amount: 5, unit: "d" } },
    {
      filter: {
        match: "all",
        conditions: [
          {
            type: "activity",
            action: "opened",
            negate: true,
            target: "workflow",
            id: "@self",
          },
        ],
      },
    },
    {
      email: {
        subject: "Where to pick it back up",
        previewText:
          "Three short pages, one for each of the places people tend to stop. Pick whichever fits.",
        format: "plain",
        lmx: `${PLAIN_STYLE}
<Paragraph>Hi {contact.firstName},</Paragraph>
<Paragraph>If you are not sure where you left off, these are the three places people usually stop:</Paragraph>
<UnorderedList>
  <ListItem><Link href="${DOCS}/cloud/quickstart">Getting your first files in</Link>, if your bucket is still empty</ListItem>
  <ListItem><Link href="${DOCS}/media-transformations/image-transformations">Transforming an image from its URL</Link>, if you never got that far</ListItem>
  <ListItem><Link href="${DOCS}/cloud/file-uploader">Wiring &lt;FileUploader /&gt; into your app</Link>, if you want client-side uploads</ListItem>
</UnorderedList>
<Paragraph>Your account and your files are untouched.</Paragraph>
${SIGNOFF}`,
      },
    },
    { wait: { amount: 12, unit: "d" } },
    {
      email: {
        subject: "Should I stop emailing you?",
        previewText:
          "One line is enough, and either answer helps me. Last email from me on this either way.",
        format: "plain",
        lmx: `${PLAIN_STYLE}
<Paragraph>Hi {contact.firstName},</Paragraph>
<Paragraph>I do not want to clutter your inbox for nothing.</Paragraph>
<Paragraph>If Openinary was not what you were looking for, reply with one line telling me why. That is genuinely the most useful thing you can send me, and I will stop writing.</Paragraph>
<Paragraph>If it was only a timing thing, say that instead and I will come back to you when video and bring-your-own-bucket are further along.</Paragraph>
${SIGNOFF}`,
      },
    },
  ],
};

// --- 4. Upgrade ------------------------------------------------------------
//
// Only for accounts that actually put something in: pitching a paid plan to an
// empty bucket is how you teach someone to ignore you. Three weeks in, still
// Free, has uploaded.
//
// Both emails quote real numbers from apps/web/src/lib/usage.ts. "Double the
// allowance" is a claim; "2 GB, 1,000 transformations" is a reason, and it is
// also checkable against the dashboard the reader already has open.

const upgrade: Sequence = {
  name: "Cloud - Upgrade invite",
  description:
    "Three weeks in, still on Free, has actually uploaded. Built from api/scripts/loops-sequences.ts.",
  trigger: { type: "signup" },
  reEligible: false,
  steps: [
    { wait: { amount: 21, unit: "d" } },
    {
      filter: {
        match: "all",
        conditions: [
          { type: "property", key: "plan", operator: "equals", value: "free" },
          {
            type: "property",
            key: "storageMb",
            operator: "greaterThan",
            value: 0,
          },
          // Anyone past 80% is already in "Approaching free limit", whose first
          // email carries the same bullet list and the same button as the one
          // below. Two identical pitches a day apart is the one place these
          // sequences genuinely spam, so the busier account keeps the sequence
          // that can quote its own numbers and leaves this one.
          {
            type: "property",
            key: "usagePercent",
            operator: "lessThan",
            value: 80,
          },
        ],
      },
    },
    {
      email: {
        subject: "Double your limits for $0 a month",
        previewText:
          "Alpha has no base price. You are only charged if you go past what is included.",
        format: "styled",
        lmx: `${STYLED_STYLE}
<H1>Double your limits, no base price</H1>
<Paragraph>Hi {contact.firstName}, 👋</Paragraph>
<Paragraph>You have been running on Openinary for three weeks, so you know by now whether it works for you.</Paragraph>
<Paragraph>The Alpha plan has no monthly fee. Everything included doubles, and you are only charged if you go past it:</Paragraph>
<UnorderedList>
  <ListItem>2 buckets instead of 1</ListItem>
  <ListItem>2 GB storage, 1,000 image transformations, 30 minutes of video, 50,000 CDN requests</ListItem>
  <ListItem>Past those, service keeps running and is billed by usage instead of cut off</ListItem>
  <ListItem>Direct email support, from me</ListItem>
</UnorderedList>
<Button href="${APP}/?settings=plan" bgColor="#000000" textColor="#ffffff" borderRadius="10">Enable pay as you go</Button>
<Paragraph>P.S. Questions about the pricing? Reply and I will do the math on your numbers.</Paragraph>
${SIGNOFF}`,
      },
    },
    { wait: { amount: 7, unit: "d" } },
    {
      filter: {
        match: "all",
        conditions: [
          { type: "property", key: "plan", operator: "equals", value: "free" },
        ],
      },
    },
    {
      email: {
        subject: "What Free actually costs you",
        previewText:
          "It is not the price. It is what happens the moment you hit the ceiling.",
        format: "styled",
        lmx: `${STYLED_STYLE}
<H1>The problem with Free is not the price</H1>
<Paragraph>Hi {contact.firstName},</Paragraph>
<Paragraph>On Free, hitting a limit stops the service until your monthly allowance resets. Requests get refused and images stop loading. That is the real cost.</Paragraph>
<Paragraph>On Alpha there is no ceiling to hit. You are billed for what you go over:</Paragraph>
<UnorderedList>
  <ListItem>$0.03 per extra GB of storage</ListItem>
  <ListItem>$0.40 per 1,000 image transformations</ListItem>
  <ListItem>$0.50 per 100,000 CDN requests</ListItem>
</UnorderedList>
<Paragraph>For most projects at this stage that is a few dollars a month. What changes is that a page doing well stops being a problem.</Paragraph>
<Button href="${APP}/?settings=plan" bgColor="#000000" textColor="#ffffff" borderRadius="10">See your usage</Button>
${SIGNOFF}`,
      },
    },
  ],
};

// --- 5. Approaching the limit ---------------------------------------------
//
// Entered from cloud_approaching_limit, fired when the worst feature passes
// 80% of its allowance on Free. The event carries the numbers so the first
// email can name the percentage and the reset instead of saying "you are using
// a lot" - hence {event.usagePercent} and {event.resetsInDays}, in the subject
// line as well as the body.
//
// Only the first email may quote the reset. Event properties are frozen at the
// moment the workflow was entered, so three days later {event.resetsInDays} is
// three days stale and the refill it counted down to may already have
// happened. The follow-up therefore claims nothing about time and is gated on
// a usagePercent that the daily sync has since refreshed.

const nearLimit: Sequence = {
  name: "Cloud - Approaching free limit",
  description:
    "Fires on the cloud_approaching_limit event (80% of the worst feature, Free only). Built from api/scripts/loops-sequences.ts.",
  trigger: { type: "event", eventName: "cloud_approaching_limit" },
  reEligible: false,
  steps: [
    {
      email: {
        subject: "You are at {event.usagePercent}% of your free limits",
        previewText:
          "Here is what happens at 100%, and how to make sure you never find out.",
        format: "styled",
        lmx: `${STYLED_STYLE}
<H1>You are close to the ceiling</H1>
<Paragraph>Hi {contact.firstName}, 👋</Paragraph>
<Paragraph>Thanks for giving Openinary Cloud a real try. You are at {event.usagePercent}% of your Free limits, and your monthly allowances reset in {event.resetsInDays} days.</Paragraph>
<Paragraph>Until then, anything past a limit is refused. Requests fail and images stop loading.</Paragraph>
<Paragraph>Alpha removes that ceiling and still has no monthly fee:</Paragraph>
<UnorderedList>
  <ListItem>2 buckets</ListItem>
  <ListItem>2 GB storage, 1,000 image transformations, 30 minutes of video, 50,000 CDN requests</ListItem>
  <ListItem>Past those, billed by usage instead of blocked</ListItem>
  <ListItem>Direct email support</ListItem>
</UnorderedList>
<Button href="${APP}/?settings=plan" bgColor="#000000" textColor="#ffffff" borderRadius="10">Enable pay as you go</Button>
${SIGNOFF}`,
      },
    },
    { wait: { amount: 3, unit: "d" } },
    // usagePercent, not just the plan. The event fires at 80%, but the reset
    // can land anywhere in the three days that follow - somebody warned one day
    // before their refill is back near zero by now, and telling them their
    // allowance is running out would be plainly false. The daily sync keeps
    // this property fresh, so it is the one signal that knows a reset happened.
    // 60 rather than 80 so an account that is still climbing but dipped a
    // little is not dropped on a technicality.
    {
      filter: {
        match: "all",
        conditions: [
          { type: "property", key: "plan", operator: "equals", value: "free" },
          {
            type: "property",
            key: "usagePercent",
            operator: "greaterThan",
            value: 60,
          },
        ],
      },
    },
    {
      email: {
        // Says nothing about when anything resets: after the filter above we
        // know they are still high, and not which side of a refill they are on.
        subject: "Still close to your free limit",
        previewText:
          "Three days on and you are still near the ceiling. Worth deciding now.",
        format: "styled",
        lmx: `${STYLED_STYLE}
<H1>Still close to the ceiling</H1>
<Paragraph>Hi {contact.firstName},</Paragraph>
<Paragraph>You were at {event.usagePercent}% when I wrote a few days ago, and you are still up there. At this rate the ceiling is not a question of if, only of which week.</Paragraph>
<Paragraph>Your dashboard shows which limit runs out first, and what this month would have cost you on Alpha instead.</Paragraph>
<Button href="${APP}/?settings=plan" bgColor="#000000" textColor="#ffffff" borderRadius="10">See your usage</Button>
<Paragraph>P.S. If the pricing is not clear, reply and I will run the numbers on your actual usage.</Paragraph>
${SIGNOFF}`,
      },
    },
  ],
};

// --- 6. Paid welcome -------------------------------------------------------
//
// Triggered by the plan property going from free to early_access, which the
// daily sync writes. That means it lands the morning after checkout rather
// than during it - see the note on syncLifecycle in api/lib/loops.ts.

const paidWelcome: Sequence = {
  name: "Cloud - Paid welcome",
  description:
    "Fires when the plan property goes free -> early_access. Built from api/scripts/loops-sequences.ts.",
  trigger: {
    type: "property",
    key: "plan",
    is: { operator: "equal", value: "early_access" },
    was: { operator: "equal", value: "free" },
  },
  reEligible: true,
  steps: [
    {
      email: {
        subject: "You are on Alpha. Welcome aboard",
        previewText:
          "What changed on your account, and how to reach me now that you are paying for this.",
        format: "styled",
        lmx: `${STYLED_STYLE}
<H1>{contact.firstName}, welcome aboard</H1>
<Paragraph>You are now on the Openinary Cloud Alpha plan.</Paragraph>
<Paragraph>Your limits just doubled and the ceiling is gone: past what is included you are billed by usage instead of being cut off. There is no base price, so a quiet month costs you nothing. It renews monthly and you can cancel at any time.</Paragraph>
<Button href="${APP}/?settings=plan" bgColor="#000000" textColor="#ffffff" borderRadius="10">Manage subscription</Button>
<Paragraph>You can reach me by replying to this email. That is the support channel, and it is me on the other end of it.</Paragraph>
<Paragraph>Thank you, sincerely.<Br />Florian</Paragraph>`,
      },
    },
    { wait: { amount: 7, unit: "d" } },
    {
      email: {
        subject: "{contact.firstName}, what should I build next?",
        previewText:
          "You are paying for this now, which means your answer outranks my roadmap.",
        format: "plain",
        lmx: `${PLAIN_STYLE}
<Paragraph>Hi {contact.firstName},</Paragraph>
<Paragraph>One week on Alpha. Is it doing what you hoped it would?</Paragraph>
<Paragraph>You are paying for Openinary now, which means your opinion on what comes next outranks mine. What is the biggest thing missing for you today? Bring-your-own-bucket, more video options, something I have not thought of?</Paragraph>
<Paragraph>Reply and it goes straight into the roadmap.</Paragraph>
${SIGNOFF}`,
      },
    },
  ],
};

export const SEQUENCES: Sequence[] = [
  introduction,
  activationUpload,
  activationApiKey,
  activationTransform,
  winback,
  upgrade,
  nearLimit,
  paidWelcome,
];

/**
 * The custom contact properties every filter above reads. Loops rejects a
 * filter on a property that doesn't exist yet, so `loops-build.ts --properties`
 * creates these first. Names and types mirror ContactProperties in
 * api/lib/loops.ts.
 */
export const CONTACT_PROPERTIES: Array<{
  name: string;
  type: "string" | "number" | "boolean" | "date";
}> = [
  { name: "plan", type: "string" },
  { name: "bucketCount", type: "number" },
  { name: "apiKeyCount", type: "number" },
  { name: "storageMb", type: "number" },
  { name: "transformCount", type: "number" },
  { name: "usagePercent", type: "number" },
  { name: "lastActiveAt", type: "date" },
];
