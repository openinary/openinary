import { type DeliveryEvent, otlpLogsBody } from "../api/lib/delivery-log.js";

// PostHog Logs is a generic OTLP receiver, so this is a plain POST rather
// than an OpenTelemetry SDK - nothing in the Worker needs the SDK's batching
// or its bundle. EU region to match the project the logs are read in.
const ENDPOINT = "https://eu.i.posthog.com/i/v1/logs";

/**
 * Ships one account's window of deliveries to PostHog Logs. Called from
 * UsageMeter's alarm, so it runs once per flush window per active account
 * rather than once per delivery - the request path never waits on it and
 * never pays a subrequest for it.
 *
 * Failures are swallowed after logging: this is observability, and losing a
 * window of it must never take down the Autumn flush that shares the alarm.
 *
 * ponytail: every delivery is shipped, including cache hits. At roughly 450
 * bytes a record that stays inside PostHog's 50 GB/month free tier until
 * ~330M deliveries/month; past that, sample the HITs (keeping MISS,
 * transforms and errors at 100%) rather than paying per GB for the boring
 * lines.
 */
export async function sendDeliveryLogs(
  token: string | undefined,
  userId: string,
  events: DeliveryEvent[],
): Promise<void> {
  if (!token || events.length === 0) return;
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(otlpLogsBody(userId, events)),
    });
    if (!response.ok) {
      console.error(
        `PostHog Logs rejected ${events.length} records: ${response.status}`,
      );
    }
  } catch (error) {
    console.error("PostHog Logs delivery failed", error);
  }
}
