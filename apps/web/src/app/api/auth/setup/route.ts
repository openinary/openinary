import { NextResponse } from "next/server";
import { claimSetup, hasAdmin } from "shared";
import { getAuth, getAuthPolicy } from "shared/auth";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const betterAuthUrl =
    process.env.BETTER_AUTH_URL ||
    (() => {
      const { protocol, host } = new URL(request.url);
      return `${protocol}//${host}`;
    })();

  try {
    if (await hasAdmin()) {
      return NextResponse.json(
        { error: "Setup already completed. Account creation is disabled." },
        { status: 403 },
      );
    }

    // SSO-only instances are set up by signing in: the first account is made
    // admin whichever way it arrives. This calls Better Auth server-side, past
    // the hook that closes the password routes, so it checks for itself.
    if (!getAuthPolicy().passwordLogin) {
      return NextResponse.json(
        {
          error:
            "Password sign-in is turned off on this instance. Sign in with single sign-on to finish setup.",
        },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { email, password, name } = body;

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: "Email, password, and name are required" },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters long" },
        { status: 400 },
      );
    }

    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(
      password,
    );

    if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSpecialChar) {
      return NextResponse.json(
        {
          error:
            "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
        },
        { status: 400 },
      );
    }

    // Atomic, so two setups racing on a fresh instance can't both create an
    // account (this call goes past the HTTP sign-up hook that claims it too).
    if (!(await claimSetup())) {
      return NextResponse.json(
        { error: "Setup is already in progress or completed. Reload the page." },
        { status: 409 },
      );
    }

    // Call Better Auth directly (server-side) to avoid HTTP round-trips through
    // the public reverse proxy (e.g. Coolify/nginx), which would return HTML
    // instead of JSON and cause "Unexpected token '<'" parse errors.
    logger.info("[Setup] Creating admin account", { email, betterAuthUrl });

    const authResponse = await (await getAuth()).api.signUpEmail({
      body: { email, password, name },
    });

    logger.info("[Setup] Admin account created successfully", { email });
    return NextResponse.json(authResponse, { status: 201 });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("[Setup] Error creating admin account", {
      error: err.message,
      stack: err.stack,
      betterAuthUrl,
      nodeEnv: process.env.NODE_ENV,
    });

    const errorMessage =
      err.message || "An error occurred while creating the account";

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
