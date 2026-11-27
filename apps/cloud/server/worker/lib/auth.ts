// Auth for the Worker. The better-auth instance itself lives in
// auth-instance.ts and is loaded on the first request that needs it, not at
// Worker startup: evaluating better-auth and its plugins is most of the
// Worker's startup CPU, and Cloudflare refuses a deploy whose startup runs
// past its limit (code 10021). `auth` below keeps the instance's shape
// (auth.api.*, auth.handler), so callers don't know the difference.
//
// What stays here is what must load without better-auth: the email sender
// and templates (tests import them under plain tsx) and the session KV hook.

import type { authInstance } from "./auth-instance.js";

type Auth = typeof authInstance;

let instance: Auth | undefined;

/**
 * The better-auth instance, built once per isolate on first use. Caches the
 * instance, never the loading promise: a promise belongs to the request that
 * created it, and if that request ends first (a client hanging up), every
 * later request awaiting it fails with "This promise was created by a
 * request that has since ended". That locked everyone out of sign-in.
 */
export async function loadAuth(): Promise<Auth> {
  instance ??= (await import("./auth-instance.js")).authInstance;
  return instance;
}

export const auth: Pick<Auth, "api" | "handler"> = {
  // Every endpoint is async already, so awaiting the instance first changes
  // nothing for callers.
  api: new Proxy({} as Auth["api"], {
    get: (_target, name) =>
      async (...args: unknown[]) => {
        const { api } = await loadAuth();
        const endpoint = api[name as keyof typeof api] as unknown as (
          ...a: unknown[]
        ) => unknown;
        return endpoint(...args);
      },
  }),
  handler: async (request: Request) => (await loadAuth()).handler(request),
};

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] as string,
  );

/** Team invitation email. Names are user input, so the HTML escapes them. */
export function invitationEmail(input: {
  inviterName: string;
  accountName: string;
  role: string;
  url: string;
}) {
  const inviter = escapeHtml(input.inviterName);
  const account = escapeHtml(input.accountName);
  return {
    subject: `${input.inviterName} invited you to ${input.accountName} on Openinary`,
    text: `${input.inviterName} invited you to join ${input.accountName} on Openinary as ${input.role}.\n\nAccept the invitation:\n${input.url}\n\nIt expires in 48 hours. If you weren't expecting it, ignore this email.`,
    html: `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#111">
  <p style="margin:0 0 16px;font-size:15px">${inviter} invited you to join <strong>${account}</strong> on Openinary as ${escapeHtml(input.role)}.</p>
  <p style="margin:0 0 16px"><a href="${input.url}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#111;color:#fff;text-decoration:none;font-size:15px;font-weight:600">Accept invitation</a></p>
  <p style="margin:0;font-size:13px;color:#666">It expires in 48 hours. If you weren't expecting it, ignore this email.</p>
</div>`,
  };
}

/**
 * Cloudflare Email Sending, over its REST API rather than the Worker's
 * `send_email` binding: the binding needs `import { env } from
 * "cloudflare:workers"`, a specifier Node can't resolve, and this module is
 * pulled into tests that run under plain tsx. One fetch keeps
 * the file runnable in both places.
 *
 * The sending domain is onboarded once, out of band:
 *   wrangler email sending enable openinary.dev
 */
export async function sendEmail(message: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/email/sending/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CLOUDFLARE_EMAIL_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...message,
        from: { address: "login@openinary.dev", name: "Openinary" },
      }),
    },
  );
  // Better Auth swallows nothing: a throw here surfaces as a failed
  // send-code call, which is what the sign-in form needs to report.
  if (!res.ok) {
    throw new Error(`Email send failed (${res.status}): ${await res.text()}`);
  }
}

/** The slice of the AUTH_SESSIONS KV namespace better-auth needs. */
export type SessionKv = {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
};

// Set per request by app.ts's first middleware. Not imported from
// "cloudflare:workers": this module runs under plain tsx in tests and is
// type-checked by the dashboards, where that specifier doesn't exist. Unset
// (tests, scripts), every read misses and falls back to Postgres, which is
// exactly how auth behaved before this store existed.
let sessionKv: SessionKv | undefined;
export function bindSessionKv(kv: SessionKv | undefined): void {
  sessionKv = kv;
}

/** Read by the auth instance's secondaryStorage on every session lookup. */
export function currentSessionKv(): SessionKv | undefined {
  return sessionKv;
}
