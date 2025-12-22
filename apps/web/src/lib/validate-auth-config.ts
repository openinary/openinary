/**
 * Validation utility for authentication configuration
 * Checks if BETTER_AUTH_URL matches the current URL
 */

export interface AuthConfigValidation {
  isValid: boolean;
  error?: string;
  currentUrl: string;
  betterAuthUrl?: string;
}

/**
 * Validates the authentication configuration against the current browser URL
 * @returns Validation result with detailed error message if configuration is invalid
 */
export async function validateAuthConfig(): Promise<AuthConfigValidation> {
  // Only run in browser
  if (typeof window === "undefined") {
    return { isValid: true, currentUrl: "" };
  }

  const currentUrl = window.location.origin;

  try {
    // Fetch the server configuration
    const response = await fetch("/api/auth/config", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      // If we can't fetch config, allow to proceed (fail open for better UX)
      console.warn("Could not fetch auth config, skipping validation");
      return { isValid: true, currentUrl };
    }

    const config = await response.json();
    const { betterAuthUrl, nodeEnv } = config;

    // In development, be more lenient with localhost variations
    if (nodeEnv === "development") {
      const isLocalhost = currentUrl.includes("localhost") || currentUrl.includes("127.0.0.1");
      const configIsLocalhost = 
        (betterAuthUrl?.includes("localhost") || betterAuthUrl?.includes("127.0.0.1"));
      
      if (isLocalhost && configIsLocalhost) {
        // In dev, localhost with different ports is OK
        return { isValid: true, currentUrl, betterAuthUrl };
      }
    }

    // Check if URLs match
    const urlsMatch = currentUrl === betterAuthUrl;

    if (!urlsMatch) {
      const error = formatConfigError(currentUrl, betterAuthUrl, nodeEnv);
      return {
        isValid: false,
        error,
        currentUrl,
        betterAuthUrl,
      };
    }

    return { isValid: true, currentUrl, betterAuthUrl };
  } catch (error) {
    console.error("Error validating auth config:", error);
    // Fail open - allow to proceed if validation fails
    return { isValid: true, currentUrl };
  }
}

/**
 * Formats a detailed error message for configuration mismatch
 */
function formatConfigError(
  currentUrl: string,
  betterAuthUrl: string | undefined,
  nodeEnv: string
): string {
  const lines: string[] = [
    "⚠️ Configuration Error: URL Mismatch",
    "",
    `Current URL: ${currentUrl}`,
  ];

  if (betterAuthUrl && betterAuthUrl !== currentUrl) {
    lines.push(`Expected URL (BETTER_AUTH_URL): ${betterAuthUrl}`);
  }

  lines.push(
    "",
    "The authentication server is configured for a different URL.",
    "This will prevent login and signup from working correctly.",
    "",
    "To fix this, update your environment variable:",
    `  • BETTER_AUTH_URL=${currentUrl}`,
    "",
    "Then restart the application.",
  );

  if (nodeEnv === "production") {
    lines.push(
      "",
      "💡 Tip: In containerized deployments (Docker, Kubernetes), make sure",
      "this environment variable is set at runtime, not build time.",
    );
  }

  return lines.join("\n");
}

/**
 * Simplified validation for inline checks (returns just the error message)
 */
export async function getAuthConfigError(): Promise<string | null> {
  const validation = await validateAuthConfig();
  return validation.isValid ? null : (validation.error || "Configuration error");
}
