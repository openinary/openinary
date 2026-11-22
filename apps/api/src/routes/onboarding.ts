import { Hono } from "hono";
import { can, getDb, kvGet, kvInit, kvSet, MAX_USE_CASES, SLUG } from "shared";

import type { AuthVariables } from "../middleware/auth";
import { telemetryEnabled, trackOnboardingCompleted } from "../utils/telemetry";

/**
 * The first-run questionnaire. Answers are per user; the workspace (name and
 * logo shown in the sidebar) is per instance, since every account on an
 * instance looks at the same one, so only an admin (settings:manage) writes it:
 * while onboarding, or later from Settings › Workspace (PUT /workspace).
 */
const onboarding = new Hono<AuthVariables>();

type Workspace = { name: string; logo: string | null };

// 128px squares encode to ~10 KB; this leaves room for a PNG fallback.
const LOGO = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const LOGO_MAX = 200_000;

/**
 * The workspace in a request body, trimmed, or null when it isn't valid: a
 * name of 1-60 characters and an optional small square image as a data URL.
 */
function parseWorkspace(value: unknown): Workspace | null {
  if (!value || typeof value !== "object") return null;
  const { name: rawName, logo: rawLogo } = value as Record<string, unknown>;
  const name = typeof rawName === "string" ? rawName.trim().slice(0, 60) : "";
  const logo = rawLogo ?? null;
  if (!name) return null;
  if (
    logo !== null &&
    (typeof logo !== "string" || logo.length > LOGO_MAX || !LOGO.test(logo))
  ) {
    return null;
  }
  return { name, logo };
}

const answersKey = (userId: string) => `onboarding:${userId}`;

const readJson = <T>(key: string) => {
  const value = kvGet(getDb(), key);
  return value === undefined ? undefined : (JSON.parse(value) as T);
};

// Accounts that existed before this instance first ran a version with the
// questionnaire never see it: Cloud's rule, but per instance, since each one
// upgrades on its own day. The minute of slack keeps a fresh install's first
// admin in, even one created from OPENINARY_ADMIN_* while the server boots.
const onboardingSince =
  Number(kvInit(getDb(), "onboarding_since", String(Date.now()))) - 60_000;

function predatesOnboarding(userId: string): boolean {
  const row = getDb()
    .prepare("SELECT createdAt FROM user WHERE id = ?")
    .get(userId) as { createdAt: string | number } | undefined;
  return !!row && new Date(row.createdAt).getTime() < onboardingSince;
}

onboarding.get("/", (c) => {
  const userId = c.get("user")?.id ?? "";
  return c.json({
    completed:
      kvGet(getDb(), answersKey(userId)) !== undefined ||
      predatesOnboarding(userId),
    workspace: readJson<Workspace>("workspace") ?? null,
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

  // Everyone saves their own answers, but the workspace is the instance's:
  // only an admin sets it (and must send one). Anyone else's is ignored, even
  // when none is set yet, so the first viewer in doesn't name the team.
  const user = c.get("user");
  const workspaceSaved = can(user?.role, "settings:manage");
  const workspace = workspaceSaved ? parseWorkspace(body?.workspace) : null;

  if (
    typeof role !== "string" ||
    !SLUG.test(role) ||
    !Array.isArray(useCases) ||
    useCases.length > MAX_USE_CASES ||
    !useCases.every((v) => typeof v === "string" && SLUG.test(v)) ||
    (source !== null && (typeof source !== "string" || !SLUG.test(source))) ||
    (workspaceSaved && !workspace)
  ) {
    return c.json({ error: "Invalid onboarding answers" }, 400);
  }

  if (workspace) kvSet(getDb(), "workspace", JSON.stringify(workspace));
  kvSet(
    getDb(),
    answersKey(userId),
    JSON.stringify({ role, useCases, source, completedAt: Date.now() }),
  );
  void trackOnboardingCompleted({ role, use_cases: useCases, source });

  return c.json({ ok: true, workspaceSaved });
});

// Settings › Workspace. index.ts puts requirePermission("settings:manage")
// in front of this.
onboarding.put("/workspace", async (c) => {
  const workspace = parseWorkspace(await c.req.json().catch(() => null));
  if (!workspace) return c.json({ error: "Invalid workspace" }, 400);
  kvSet(getDb(), "workspace", JSON.stringify(workspace));
  return c.json({ workspace });
});

export default onboarding;
