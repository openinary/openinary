/**
 * The exact call the dashboard's Google button makes. It exercises the auth
 * mount, Postgres (better-auth writes the OAuth state row) and the Google
 * credentials in a single request - while all of that was broken
 * /api/auth/ok kept cheerfully answering 200.
 */
export function signInRequest(authUrl: string, origin: string): Request {
  return new Request(`${authUrl}/api/auth/sign-in/social`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    // disableRedirect keeps the answer JSON instead of a hop to Google.
    body: JSON.stringify({
      provider: "google",
      callbackURL: origin,
      disableRedirect: true,
    }),
  });
}

type ProbeOptions = {
  authUrl: string;
  origin: string;
  attempts?: number;
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Resolves to null when sign-in works, otherwise to a one-line description
 * of the last failure. Only alerts after every attempt failed, so a single
 * blip (Neon waking its suspended compute on the hourly tick) stays quiet
 * while an outage that outlasts the retry still gets reported.
 */
export async function probeSignIn(
  send: (request: Request) => Promise<Response>,
  {
    authUrl,
    origin,
    attempts = 2,
    retryDelayMs = 10_000,
    sleep = wait,
  }: ProbeOptions,
): Promise<string | null> {
  let failure = "";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (attempt > 1) await sleep(retryDelayMs);
    try {
      const res = await send(signInRequest(authUrl, origin));
      if (res.ok) return null;
      // Body included because better-auth answers an unexpected failure with
      // an empty 500 - the status alone was what made this one slow to place.
      failure = `${res.status} ${(await res.text()).slice(0, 300)}`;
    } catch (error) {
      failure = `threw ${error}`;
    }
  }
  return `POST /api/auth/sign-in/social -> ${failure} (${attempts} attempts)`;
}
