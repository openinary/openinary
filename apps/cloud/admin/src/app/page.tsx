"use client";

import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Empty,
  Freshness,
  LoadingRows,
  StatusBadge,
} from "@/components/fields";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  // What is actually asked for. Typing is a keystroke a Postgres LIKE behind
  // otherwise, and the list flickering through four intermediate answers is
  // worse than seeing the one that matters a quarter-second later.
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isPending, isFetching, dataUpdatedAt, error } = useQuery(
    orpc.admin.list.queryOptions({
      input: { search: query || undefined },
      // Refining a search changes the key, which would otherwise empty the
      // table on every keystroke. The previous matches stay put, marked as
      // refreshing, until the narrower ones arrive.
      placeholderData: keepPreviousData,
    }),
  );

  // The fiche reads four upstreams and is the slowest page here. Pointing at a
  // row is a good enough guess that it is about to be opened, and warming it
  // costs nothing when the guess is wrong. Focus counts too: keyboard use
  // never hovers.
  const prefetch = (userId: string) =>
    queryClient.prefetchQuery(
      orpc.admin.get.queryOptions({ input: { userId } }),
    );

  // Not-the-administrator no longer reaches here - src/middleware.ts answers
  // that with a 403 before the page is served - so anything left is a real
  // failure worth reading verbatim. Only when there is nothing to show
  // instead, though: a refetch that fails over a cached list is already a
  // toast, and swapping the list for its error message loses more than it
  // says.
  if (error && !data) return <Empty>{error.message}</Empty>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <HugeiconsIcon
            icon={Search01Icon}
            strokeWidth={2}
            className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by email…"
            className="pl-9"
            type="search"
            autoComplete="off"
          />
        </div>
        {data ? (
          <span className="shrink-0 text-muted-foreground text-sm tabular-nums">
            {data.total} account{data.total === 1 ? "" : "s"}
          </span>
        ) : null}
        <div className="ml-auto">
          <Freshness isFetching={isFetching} updatedAt={dataUpdatedAt} />
        </div>
      </div>

      <Card className="gap-0 py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              {/* Below md the name rides under the email instead of taking a
                  column of its own, and the join date goes: on a phone the
                  three that decide anything are who, what state, and nothing
                  else. */}
              <TableHead className="hidden md:table-cell">Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden text-right sm:table-cell">
                Joined
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.users.map((account) => (
              // One link, stretched over the row: a <tr> cannot be a link
              // itself, and repeating the href in every cell would break
              // text selection and give the row four tab stops.
              <TableRow
                key={account.id}
                className="relative"
                onMouseEnter={() => prefetch(account.id)}
                onFocusCapture={() => prefetch(account.id)}
              >
                <TableCell className="font-medium">
                  <Link
                    href={`/users/${account.id}`}
                    className="after:absolute after:inset-0"
                  >
                    {account.email}
                  </Link>
                  <span className="block truncate font-normal text-muted-foreground text-xs md:hidden">
                    {account.name}
                  </span>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {account.name}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1.5">
                    {account.suspended ? (
                      <StatusBadge tone="bad">suspended</StatusBadge>
                    ) : null}
                    {account.banned ? (
                      <StatusBadge tone="warn">banned</StatusBadge>
                    ) : null}
                    {!account.suspended && !account.banned ? (
                      <StatusBadge tone="good">active</StatusBadge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="hidden text-right text-muted-foreground tabular-nums sm:table-cell">
                  {formatDate(account.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {isPending ? <LoadingRows /> : null}
        {data && data.users.length === 0 ? (
          <div className="px-3 pb-2">
            <Empty>No accounts.</Empty>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
