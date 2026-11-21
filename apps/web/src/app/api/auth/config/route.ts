import { NextResponse } from "next/server";
import { AuthConfigError, publicAuthOptions } from "shared";
import { getAuthPolicy } from "shared/auth";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Public: lets the frontend check its URL matches the configured one, and
 * tells the sign-in pages which methods to draw (SSO buttons, the password
 * form). Nothing secret: provider ids, names and types only.
 *
 * A broken AUTH_* config answers 200 with no methods and `authConfigError`
 * rather than a 500: Better Auth can't start on that config either, so every
 * sign-in would fail anyway, and this way the page can say why next to the
 * URL check instead of offering a form that can only error. The message names
 * the variable to fix, which is what the person reading it needs.
 */
export async function GET() {
  const base = {
    betterAuthUrl: process.env.BETTER_AUTH_URL,
    nodeEnv: process.env.NODE_ENV,
  };

  try {
    return NextResponse.json({ ...base, ...publicAuthOptions(getAuthPolicy()) });
  } catch (error) {
    logger.error("[Auth] Invalid sign-in configuration", { error });
    return NextResponse.json({
      ...base,
      providers: [],
      passwordLogin: false,
      authConfigError:
        error instanceof AuthConfigError
          ? error.message
          : "The sign-in configuration couldn't be read. Check the server logs.",
    });
  }
}
