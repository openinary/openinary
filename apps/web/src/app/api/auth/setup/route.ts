import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

// Helper function to check if any admin account exists
function hasAdminAccount(): boolean {
  try {
    // Use the same database path as the API server
    // From apps/web, go up 2 levels to reach the root, then into data/auth.db
    const dbPath = process.env.DB_PATH || path.join(process.cwd(), "../../data/auth.db");
    const db = new Database(dbPath, { readonly: true });
    const result = db.prepare("SELECT COUNT(*) as count FROM user").get() as { count: number };
    db.close();
    return result.count > 0;
  } catch (error) {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    // Security check: Prevent account creation if an admin already exists
    if (hasAdminAccount()) {
      return NextResponse.json(
        { error: "Setup already completed. Account creation is disabled." },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { email, password, name } = body;

    // Validate required fields
    if (!email || !password || !name) {
      return NextResponse.json(
        { error: "Email, password, and name are required" },
        { status: 400 }
      );
    }

    // Validate password length
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters long" },
        { status: 400 }
      );
    }

    // Validate password complexity
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

    if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSpecialChar) {
      return NextResponse.json(
        { error: "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character" },
        { status: 400 }
      );
    }

    // Forward the signup request to Better Auth
    const authResponse = await fetch(`${process.env.BETTER_AUTH_URL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password, name }),
    });

    const data = await authResponse.json();

    if (!authResponse.ok) {
      return NextResponse.json(
        { error: data.error || "Failed to create account" },
        { status: authResponse.status }
      );
    }

    return NextResponse.json(data);
  } catch (error: any) {
    logger.error("Error creating admin account", { error });
    return NextResponse.json(
      { error: error.message || "An error occurred while creating the account" },
      { status: 500 }
    );
  }
}

