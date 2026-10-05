import { Hono } from "hono";
import { db } from "shared/auth";

import { activityLog } from "../config/activity";
import type { AuthVariables } from "../middleware/auth";
import { telemetryEnabled, trackOnboardingCompleted } from "../utils/telemetry";

/**
 * The first-run questionnaire. Answers are per user; the workspace (name and
 * logo shown in the sidebar) is per instance, since every account on an
 * instance looks at the same one.
 */
const onboarding = new Hono<AuthVariables>();

type Workspace = { name: string; logo: string | null };

const SLUG = /^[a-z0-9-]{1,40}$/;
// 128px squares encode to ~10 KB; this leaves room for a PNG fallback.
const LOGO = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const LOGO_MAX = 200_000;

const answersKey = (userId: string) => `onboarding:${userId}`;

// Accounts that existed before this instance first ran a version with the
// questionnaire never see it: Cloud's rule, but per instance, since each one
// upgrades on its own day. The minute of slack keeps a fresh install's first
// admin in, even one created from OPENINARY_ADMIN_* while the server boots.
//
// Computed on first use, not at import: `activityLog` sits on the lazy db
// Proxy, which throws until initDb() has run — a module-scope call would
// break importing this file. The promise is kept so the (once-per-boot DB
// round trip) still happens exactly once.
let onboardingSinceP: Promise<number> | undefined;
const onboardingSince = () =>
  (onboardingSinceP ??= activityLog
    .since("onboarding_since")
    .then((v) => v - 60_000));

async function predatesOnboarding(userId: string): Promise<boolean> {
  const row = await db.user.findUnique({
    where: { id: userId },
    select: { createdAt: true },
  });
  return !!row && row.createdAt.getTime() < (await onboardingSince());
}

onboarding.get("/", async (c) => {
  const userId = c.get("user")?.id ?? "";
  return c.json({
    completed:
      !!(await activityLog.getState(answersKey(userId))) ||
      (await predatesOnboarding(userId)),
    workspace: (await activityLog.getState<Workspace>("workspace")) ?? null,
    telemetry: telemetryEnabled,
  });
});

onboarding.post("/", async (c) => {
  const userId = c.get("user")?.id;
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json().catch(() => null);
  const role = body?.role;
  const useCases = body?.useCases;
  const source = body?.source ?? null;
  const name = typeof body?.workspace?.name === "string"
    ? body.workspace.name.trim().slice(0, 60)
    : "";
  const logo = body?.workspace?.logo ?? null;

  if (
    typeof role !== "string" ||
    !SLUG.test(role) ||
    !Array.isArray(useCases) ||
    useCases.length > 20 ||
    !useCases.every((v) => typeof v === "string" && SLUG.test(v)) ||
    (source !== null && (typeof source !== "string" || !SLUG.test(source))) ||
    !name ||
    (logo !== null &&
      (typeof logo !== "string" || logo.length > LOGO_MAX || !LOGO.test(logo)))
  ) {
    return c.json({ error: "Invalid onboarding answers" }, 400);
  }

  await activityLog.setState("workspace", { name, logo } satisfies Workspace);
  await activityLog.setState(answersKey(userId), {
    role,
    useCases,
    source,
    completedAt: Date.now(),
  });
  void trackOnboardingCompleted({ role, use_cases: useCases, source });

  return c.json({ ok: true });
});

export default onboarding;
