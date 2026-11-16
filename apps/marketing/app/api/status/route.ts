import { OVERALL_LABEL, getStatus } from "@/lib/status";

export const dynamic = "force-dynamic";

/** The overall state only: the footer pill on every page reads this. */
export async function GET() {
  const { impact, checkedAt } = await getStatus();
  return Response.json(
    { impact, label: OVERALL_LABEL[impact], checkedAt },
    // Not cached in the browser: the probes already are (lib/status.ts), and a
    // stale pill would contradict the /status page it sits under.
    { headers: { "Cache-Control": "no-store" } },
  );
}
