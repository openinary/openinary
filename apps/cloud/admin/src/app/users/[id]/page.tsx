"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/confirm-action";
import {
  Empty,
  Field,
  Freshness,
  LoadingRows,
  StatusBadge,
} from "@/components/fields";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBytes, formatDate, formatMoney } from "@/lib/utils";
import { adminFetch, orpc } from "@/utils/orpc";

/**
 * Autumn meters each feature in its own unit, and the balance it hands back is
 * a bare number in that unit. Two of the four are counts and read fine as-is;
 * the other two do not. Storage is metered in megabytes, so printing the
 * balance gives "1,234" where the answer is "1.2 GB", and video is metered in
 * seconds of container time while the plan quotes minutes.
 *
 * Same units the customer sees on their own plan tab (apps/web/src/lib/
 * usage.ts) - an admin reading a different number from the one being disputed
 * is the one thing this page must never do.
 */
const count = (value: number) => value.toLocaleString();

const FEATURES = {
  storage_mb: {
    label: "Storage",
    format: (mb: number) => formatBytes(mb * 1024 * 1024),
  },
  image_transformations: { label: "Image transformations", format: count },
  video_processing_seconds: {
    label: "Video processing",
    format: (seconds: number) =>
      `${Math.round(seconds / 60).toLocaleString()} min`,
  },
  cdn_requests: { label: "CDN requests", format: count },
} as const;

/**
 * PostHog's log view takes its filters as URL-encoded JSON. Built here rather
 * than pasted as an opaque encoded string so the filter it applies - this
 * account's deliveries, last seven days - is readable.
 */
const posthogLogsUrl = (userId: string) =>
  `https://eu.posthog.com/project/214489/logs?dateRange=${encodeURIComponent(
    JSON.stringify({ date_from: "-7d", date_to: null }),
  )}&filterGroup=${encodeURIComponent(
    JSON.stringify({
      type: "AND",
      values: [
        {
          type: "AND",
          values: [
            {
              key: "user_id",
              value: [userId],
              operator: "exact",
              type: "log_attribute",
            },
          ],
        },
      ],
    }),
  )}`;

/** Card actions are all outbound links to the system the card mirrors. */
function CardLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-muted-foreground text-sm underline underline-offset-4 hover:text-foreground"
    >
      {children}
    </a>
  );
}

export default function UserPage() {
  const userId = String(useParams().id);
  const router = useRouter();
  const queryClient = useQueryClient();
  const query = orpc.admin.get.queryOptions({ input: { userId } });
  const { data, isFetching, dataUpdatedAt, error } = useQuery(query);

  /**
   * Every action invalidates the whole fiche rather than patching a field: the
   * point of this page is that it agrees with the four systems behind it, and
   * a locally-updated badge that doesn't match what Autumn or the KV actually
   * did is the one thing it must never show.
   */
  const act = useMutation({
    mutationFn: async (run: () => Promise<unknown>) => run(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: query.queryKey });
    },
    onError: (mutationError: Error) => toast.error(mutationError.message),
  });

  // `data` rather than `isPending`: a refetch behind a cached fiche is not a
  // reason to take it off the screen. Only having never had one is.
  if (error && !data) return <Empty>{error.message}</Empty>;
  if (!data) return <LoadingRows rows={6} />;

  const { user, usage, billing, buckets, apiKeys, sessions, activity, attio } =
    data;

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-full sm:basis-auto">
          <h1 className="truncate font-semibold text-lg">{user.email}</h1>
          <p className="text-muted-foreground text-sm">
            {user.name} · joined {formatDate(user.createdAt)}
          </p>
        </div>
        {user.suspended ? (
          <StatusBadge tone="bad">suspended</StatusBadge>
        ) : null}
        {user.banned ? <StatusBadge tone="warn">banned</StatusBadge> : null}
        {!user.suspended && !user.banned ? (
          <StatusBadge tone="good">active</StatusBadge>
        ) : null}
        <div className="ml-auto">
          <Freshness isFetching={isFetching} updatedAt={dataUpdatedAt} />
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {/* Suspension and ban are separate switches because they stop
              different things, which is exactly what each dialog spells out:
              a ban only blocks sign-in, while suspension is what actually cuts
              off the CDN and the API keys. */}
          {user.suspended ? (
            <ConfirmAction
              label="Resume service"
              disabled={act.isPending}
              title="Resume service for this account?"
              description="Undoes the suspension. The account is served again."
              consequences={[
                "Public CDN URLs start serving from every bucket again.",
                "All of its API keys are re-enabled — including any the customer had disabled themselves.",
                "If the account is over its CDN quota, the quota block returns within a minute.",
              ]}
              confirmLabel="Resume service"
              onConfirm={() =>
                act.mutate(() => orpc.admin.unsuspend.call({ userId }))
              }
            />
          ) : (
            <ConfirmAction
              label="Suspend service"
              disabled={act.isPending}
              title="Suspend service for this account?"
              description="Stops serving the account without locking them out of their own data."
              consequences={[
                "Public CDN URLs return 403 for every one of its buckets.",
                "All of its API keys stop authenticating — uploads and integrations break.",
                "They can still sign in and see their dashboard. Use “Ban sign-in” for that.",
                "Reversible at any time.",
              ]}
              confirmLabel="Suspend service"
              onConfirm={() =>
                act.mutate(() => orpc.admin.suspend.call({ userId }))
              }
            />
          )}

          {user.banned ? (
            <ConfirmAction
              label="Lift ban"
              disabled={act.isPending}
              title="Let this account sign in again?"
              description="Removes the ban. Existing sessions are not restored — they sign in fresh."
              consequences={[
                "Sign-in works again, by emailed code as usual.",
                "Nothing else changes: if the account is suspended, it stays suspended.",
              ]}
              confirmLabel="Lift ban"
              onConfirm={() =>
                act.mutate(() => orpc.admin.unban.call({ userId }))
              }
            />
          ) : (
            <ConfirmAction
              label="Ban sign-in"
              disabled={act.isPending}
              title="Ban this account from signing in?"
              description="Locks the person out of the dashboard. It does not stop the service."
              consequences={[
                "Sign-in is refused and every live session is dropped immediately.",
                "Their CDN URLs keep serving and their API keys keep working — use “Suspend service” to stop that.",
                "Reversible at any time.",
              ]}
              field={{ label: "Reason (optional, stored on the account)" }}
              confirmLabel="Ban sign-in"
              onConfirm={(reason) =>
                act.mutate(() =>
                  orpc.admin.ban.call({ userId, reason: reason || undefined }),
                )
              }
            />
          )}

          <ConfirmAction
            label="Change plan"
            disabled={act.isPending}
            title="Move this account to another plan?"
            description="Attaches the plan directly in Autumn, with no Stripe checkout."
            consequences={[
              "No payment is collected and no card is requested.",
              "If the plan prices overage, that overage cannot be billed until the customer adds a card themselves.",
              "Only meaningful for free or deliberately comped plans.",
            ]}
            field={{
              label: "Plan id",
              placeholder: "free",
              required: true,
            }}
            confirmLabel="Change plan"
            onConfirm={(planId) =>
              act.mutate(() => orpc.admin.setPlan.call({ userId, planId }))
            }
          />

          <ConfirmAction
            label="Delete account"
            triggerVariant="destructive"
            destructive
            confirmWith={user.email}
            title="Delete this account everywhere?"
            description="Erases the customer from every system they exist in. There is no undo."
            consequences={[
              "Every file and cached transform in all of their buckets, from R2.",
              "Their rows in Postgres: buckets, API keys, sessions, video jobs.",
              "Their delivery log, and their entry in the CDN owner cache.",
              "Their Autumn customer, and the Stripe customer behind it.",
              "Their record in Attio, if they have one.",
              "Their Loops contact, which also stops any email sequence mid-flight.",
            ]}
            confirmLabel="Delete account"
            onConfirm={async () => {
              await adminFetch(`/admin/users/${userId}`, { method: "DELETE" });
              toast.success("Account deleted");
              router.push("/");
            }}
          />

          {user.banned && user.banReason ? (
            <p className="basis-full text-muted-foreground text-sm">
              Ban reason: {user.banReason}
              {user.banExpires ? ` (until ${formatDate(user.banExpires)})` : ""}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* The quota tiles from dashboard-01's SectionCards, on the four
          features the plan actually meters. */}
      <div className="grid @5xl/main:grid-cols-4 @xl/main:grid-cols-2 grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card">
        {Object.entries(FEATURES).map(([id, { label, format }]) => {
          const feature = usage.features[id as keyof typeof FEATURES];
          return (
            <Card key={id} size="sm" className="@container/card">
              <CardHeader>
                <CardDescription>{label}</CardDescription>
                <CardTitle className="font-semibold @[250px]/card:text-3xl text-2xl tabular-nums">
                  {feature.unlimited ? "Unlimited" : format(feature.used)}
                </CardTitle>
                {feature.unlimited ? null : (
                  <CardAction>
                    <Badge variant="outline">
                      of {format(feature.granted)}
                    </Badge>
                  </CardAction>
                )}
              </CardHeader>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2 md:gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Billing — {usage.planName ?? "Free"}</CardTitle>
            <CardAction>
              <CardLink
                href={`https://app.useautumn.com/sandbox/customers/${userId}`}
              >
                Open in Autumn
              </CardLink>
            </CardAction>
          </CardHeader>
          <CardContent>
            {usage.renewsAt ? (
              <Field label="Renews">{formatDate(usage.renewsAt)}</Field>
            ) : null}
            {usage.cancelsAt ? (
              <Field label="Cancels">{formatDate(usage.cancelsAt)}</Field>
            ) : null}
            {billing ? (
              <>
                <Field label="Payment method">
                  {billing.hasPaymentMethod ? "on file" : "none"}
                </Field>
                <Field label="Stripe">{billing.stripeId ?? "—"}</Field>
                {billing.invoices.length === 0 ? (
                  <Empty>No invoices.</Empty>
                ) : (
                  <ul className="mt-2 flex flex-col gap-1 text-sm">
                    {billing.invoices.map((invoice) => (
                      <li
                        key={`${invoice.createdAt}-${invoice.total}`}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="text-muted-foreground">
                          {formatDate(invoice.createdAt)}
                        </span>
                        <span className="tabular-nums">
                          {formatMoney(invoice.total, invoice.currency)}
                        </span>
                        {invoice.hostedInvoiceUrl ? (
                          <CardLink href={invoice.hostedInvoiceUrl}>
                            {invoice.status}
                          </CardLink>
                        ) : (
                          <span className="text-muted-foreground">
                            {invoice.status}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <Empty>Autumn is unreachable.</Empty>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Buckets ({buckets.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {buckets.length === 0 ? (
              <Empty>No buckets.</Empty>
            ) : (
              buckets.map((bucket) => (
                <Field key={bucket.id} label={bucket.name}>
                  {formatBytes(bucket.storageBytes)} ·{" "}
                  {bucket.storageFileCount.toLocaleString()} files
                </Field>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>API keys ({apiKeys.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {apiKeys.length === 0 ? (
              <Empty>No keys.</Empty>
            ) : (
              apiKeys.map((key) => (
                <Field key={key.id} label={key.name ?? key.start ?? key.id}>
                  {key.enabled ? (
                    <StatusBadge tone="good">enabled</StatusBadge>
                  ) : (
                    <StatusBadge tone="bad">disabled</StatusBadge>
                  )}{" "}
                  {key.requestCount.toLocaleString()} reqs
                </Field>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sessions ({sessions.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <Empty>No live sessions.</Empty>
            ) : (
              sessions.map((session) => (
                <Field
                  key={session.id}
                  label={session.ipAddress ?? "unknown ip"}
                >
                  expires {formatDate(session.expiresAt)}
                </Field>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>CRM</CardTitle>
            {attio ? (
              <CardAction>
                <CardLink href={attio.url}>Open in Attio</CardLink>
              </CardAction>
            ) : null}
          </CardHeader>
          <CardContent>
            {attio ? (
              <>
                <Field label="Name">{attio.name ?? "—"}</Field>
                <Field label="Added">{formatDate(attio.createdAt)}</Field>
              </>
            ) : (
              <Empty>Not in Attio.</Empty>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0">
        <CardHeader className="pb-(--card-spacing)">
          <CardTitle>
            Recent deliveries ({activity.deliveries.length})
          </CardTitle>
          <CardAction>
            <CardLink href={posthogLogsUrl(userId)}>Open in PostHog</CardLink>
          </CardAction>
        </CardHeader>
        {activity.deliveries.length === 0 ? (
          <CardContent>
            <Empty>Nothing served recently.</Empty>
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {/* Cache hit/miss and the billed count are what this table is
                    read for; on a phone the timestamp and the cache verdict
                    move onto the path's own line so both still fit. Head and
                    cell hide together, or the columns stop lining up. */}
                <TableHead className="hidden sm:table-cell">When</TableHead>
                <TableHead>Path</TableHead>
                <TableHead className="hidden sm:table-cell">Cache</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Billed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activity.deliveries.map((event) => (
                <TableRow key={`${event.t}-${event.p}`}>
                  <TableCell className="hidden text-muted-foreground tabular-nums sm:table-cell">
                    {formatDate(event.t)}
                  </TableCell>
                  <TableCell className="max-w-[12rem] truncate sm:max-w-xs">
                    {event.p}
                    <span className="block text-muted-foreground text-xs tabular-nums sm:hidden">
                      {formatDate(event.t)} · {event.c}
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {event.c}
                  </TableCell>
                  <TableCell className="tabular-nums">{event.s}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {event.cdn + event.img}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="gap-0">
        <CardHeader className="pb-(--card-spacing)">
          <CardTitle>Video jobs ({activity.videoJobs.length})</CardTitle>
        </CardHeader>
        {activity.videoJobs.length === 0 ? (
          <CardContent>
            <Empty>No video jobs.</Empty>
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="hidden sm:table-cell">When</TableHead>
                <TableHead>Path</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Seconds</TableHead>
                <TableHead className="text-right">Metered</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activity.videoJobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="hidden text-muted-foreground tabular-nums sm:table-cell">
                    {formatDate(job.createdAt)}
                  </TableCell>
                  <TableCell className="max-w-[12rem] truncate sm:max-w-xs">
                    {job.path}
                    <span className="block text-muted-foreground text-xs tabular-nums sm:hidden">
                      {formatDate(job.createdAt)}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {job.status}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {job.seconds ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {job.metered ? "✓" : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
