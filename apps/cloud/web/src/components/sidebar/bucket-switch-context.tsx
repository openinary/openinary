"use client";

import { useHideThumbnails } from "@openinary/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, useContext, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { client, orpc } from "@/utils/orpc";

interface BucketSwitchContextValue {
  isSwitching: boolean;
  /** Non-null only while a switch is in flight - the bucket being switched to. */
  switchingToId: string | null;
  switchToBucket: (bucketId: string) => Promise<void>;
}

const BucketSwitchContext = createContext<BucketSwitchContextValue | null>(
  null,
);

/**
 * Owns the one way to change the active bucket, shared by BucketSwitcher (the
 * sidebar dropdown) and the Buckets settings tab - both need the same cache
 * teardown, and duplicating that invalidation list is how one of them ends up
 * showing the outgoing bucket's files.
 *
 * `isSwitching` is also read by MediaGrid's host in dashboard.tsx, which has to
 * block clicks/hover on the old bucket's thumbnails while the switch is in
 * flight - @openinary/ui's MediaGrid has no "disabled" prop of its own.
 */
export function BucketSwitchProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchingToId, setSwitchingToId] = useState<string | null>(null);

  // Thumbnails are a persisted user preference (see @openinary/ui's
  // useHideThumbnails), not a loading flag - so while a switch is in flight we
  // force it on to avoid flashing the outgoing bucket's images, then restore
  // whatever the user actually had it set to.
  const [hideThumbnails, setHideThumbnails] = useHideThumbnails();
  const hideThumbnailsRef = useRef(hideThumbnails);
  hideThumbnailsRef.current = hideThumbnails;

  const value = useMemo(
    () => ({
      isSwitching,
      switchingToId,
      switchToBucket: async (bucketId: string) => {
        setIsSwitching(true);
        setSwitchingToId(bucketId);
        const wasHidden = hideThumbnailsRef.current;
        if (!wasHidden) setHideThumbnails(true);
        try {
          // The plain client, not useMutation: we already track the in-flight
          // state ourselves, and a mutation object would change identity every
          // render and defeat this memo.
          await client.bucket.select({ bucketId });
          // Awaited (rather than @openinary/ui's fire-and-forget
          // invalidateStorage helper) so thumbnails stay hidden until the new
          // bucket's storage tree has actually finished refetching, not just
          // until the "which bucket is active" call returns.
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: orpc.bucket.list.key() }),
            queryClient.invalidateQueries({
              queryKey: ["openinary", "storage-tree"],
            }),
            queryClient.invalidateQueries({
              queryKey: ["openinary", "storage-folders"],
            }),
          ]);
          // The folder/asset URL state means nothing under the new bucket.
          router.push("/");
        } catch {
          toast.error("Couldn't switch bucket");
        } finally {
          if (!wasHidden) setHideThumbnails(false);
          setIsSwitching(false);
          setSwitchingToId(null);
        }
      },
    }),
    [isSwitching, switchingToId, queryClient, router, setHideThumbnails],
  );

  return (
    <BucketSwitchContext.Provider value={value}>
      {children}
    </BucketSwitchContext.Provider>
  );
}

export function useBucketSwitch(): BucketSwitchContextValue {
  const ctx = useContext(BucketSwitchContext);
  if (!ctx) {
    throw new Error(
      "useBucketSwitch must be used within a BucketSwitchProvider",
    );
  }
  return ctx;
}
