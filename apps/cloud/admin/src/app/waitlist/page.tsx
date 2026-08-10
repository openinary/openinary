"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/confirm-action";
import {
  Empty,
  Freshness,
  LoadingRows,
  StatusBadge,
} from "@/components/fields";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { orpc } from "@/utils/orpc";

export default function WaitlistPage() {
  const queryClient = useQueryClient();
  const query = orpc.admin.waitlist.queryOptions();
  const { data, isFetching, dataUpdatedAt, error } = useQuery(query);

  const openAccount = useMutation({
    mutationFn: (input: { email: string; name: string }) =>
      orpc.admin.createUser.call(input),
    // The account exists either way; only the email can have gone missing, and
    // that is worth saying out loud rather than reporting a flat success.
    onSuccess: ({ emailSent }) => {
      if (emailSent) {
        toast.success("Account created — sign-in link sent");
      } else {
        toast.warning(
          "Account created, but the sign-in link didn't send. They can request a code from the sign-in form.",
        );
      }
      queryClient.invalidateQueries({ queryKey: query.queryKey });
    },
    onError: (mutationError: Error) => toast.error(mutationError.message),
  });

  // Same rule as the fiche: a refetch behind a list already on screen is not a
  // reason to take it off.
  if (error && !data) return <Empty>{error.message}</Empty>;
  if (!data) return <LoadingRows />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <Freshness isFetching={isFetching} updatedAt={dataUpdatedAt} />
      </div>

      {data.length === 0 ? (
        <Empty>
          Nothing on the waitlist — or ATTIO_API_KEY isn&apos;t set on the
          server.
        </Empty>
      ) : (
        <Card className="gap-0 py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                {/* The name rides under the email below md, and the request
                    date goes: the column that has to survive a phone is the
                    action on the right. */}
                <TableHead className="hidden md:table-cell">Name</TableHead>
                <TableHead className="hidden sm:table-cell">
                  Requested
                </TableHead>
                <TableHead className="text-right">Account</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((person) => (
                <TableRow key={person.recordId}>
                  <TableCell className="font-medium">
                    {person.email ?? "no email"}
                    <span className="block truncate font-normal text-muted-foreground text-xs md:hidden">
                      {person.name ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {person.name ?? "—"}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground tabular-nums sm:table-cell">
                    {formatDate(person.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    {/* Already opened: the same person must not get a second
                        account. */}
                    {person.userId ? (
                      <Link href={`/users/${person.userId}`}>
                        <StatusBadge tone="good">has an account</StatusBadge>
                      </Link>
                    ) : (
                      <ConfirmAction
                        label="Create account"
                        triggerVariant="default"
                        disabled={!person.email || openAccount.isPending}
                        title={`Open an account for ${person.email}?`}
                        description="Creates the account and emails them a way in. This reaches a real inbox."
                        consequences={[
                          "The account is created on the free plan, with no password — sign-in is by email.",
                          "A sign-in link is emailed to them straight away, valid for 24 hours.",
                          "No paid plan is attached: choosing and paying for one is theirs to do, with their own card.",
                        ]}
                        confirmLabel="Create account"
                        onConfirm={() => {
                          if (!person.email) return;
                          openAccount.mutate({
                            email: person.email,
                            // Attio can hold a record with no name; the account
                            // still needs one, and the local part is the best
                            // guess available.
                            name: person.name ?? person.email.split("@")[0],
                          });
                        }}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
