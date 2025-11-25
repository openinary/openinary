import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Public routes that don't require authentication
const publicPaths = ["/login", "/setup", "/api/auth", "/api/check-setup"];

function isPublicPath(pathname: string): boolean {
  return publicPaths.some((path) => pathname.startsWith(path));
}

/**
 * Validates the format of a session cookie token
 * Basic validation to avoid unnecessary API calls
 */
function isValidSessionTokenFormat(token: string): boolean {
  // Better Auth session tokens use base64url encoding
  // Base64url includes: A-Z, a-z, 0-9, -, _, = (padding), and . (in some formats)
  if (!token || token.length < 10 || token.length > 500) {
    return false;
  }
  
  // More permissive pattern - allow base64 and base64url characters
  // This includes: A-Z, a-z, 0-9, -, _, =, ., ~, /, and + (base64 standard)
  const validTokenPattern = /^[A-Za-z0-9\-_=./~+]+$/;
  const isValid = validTokenPattern.test(token);
  
  if (!isValid) {
    return false;
  }
  
  return isValid;
}

/**
 * Validates user session in Edge Runtime
 * Uses lightweight validation - full validation happens in API routes
 * This prevents middleware loops while maintaining security
 */
async function isAuthenticated(request: NextRequest): Promise<boolean> {  
  // Get the session cookie
  const sessionCookie = request.cookies.get("better-auth.session_token");
  
  if (!sessionCookie?.value) {
    return false;
  }
  
  // Security: Validate token format before allowing access
  // This prevents obviously invalid tokens from passing through
  if (!isValidSessionTokenFormat(sessionCookie.value)) {
    return false;
  }
  
  // Note: Full session validation happens in API routes via Better Auth
  // The middleware only performs basic format validation to avoid:
  // 1. Infinite loops from middleware calling middleware
  // 2. Performance issues from HTTP calls in middleware
  // 3. Edge Runtime limitations with database access
  
  // If cookie format is valid, allow through - Better Auth will validate in API routes
  // This is a trade-off: we rely on Better Auth's validation in protected API routes
  return true;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow all OPTIONS requests for CORS preflight
  if (request.method === "OPTIONS") {
    return NextResponse.next();
  }

  // Allow access to public paths
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Allow access to static files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // If user is not authenticated, redirect to login
  // The login page will handle redirecting to setup if needed
  const authenticated = await isAuthenticated(request);
  if (!authenticated) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

