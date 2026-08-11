"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/confirm-action";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { adminFetch } from "@/utils/orpc";

/**
 * Legal takedown by reference. A complaint quotes the URL a viewer saw, so
 * that is what this takes - the server resolves the bucket's owner and strips
 * any transform segment, so the *original* goes, not just the derivative in
 * the URL (which would be regenerated on the next request).
 */
export default function TakedownPage() {
  const [ref, setRef] = useState("");
  const trimmed = ref.trim();
  // Confirm on the filename rather than the whole URL: retyping a signed CDN
  // path is busywork, but naming the file is a deliberate act.
  const filename = trimmed.split(/[?#]/)[0].split("/").filter(Boolean).pop();

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Remove an asset</CardTitle>
        <CardDescription>
          Paste the URL or path from the complaint. The original and every
          cached variant are removed, and the freed storage is credited back to
          the account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Input
          value={ref}
          onChange={(event) => setRef(event.target.value)}
          placeholder="https://cdn.openinary.dev/b/…/t/photo.png"
          className="font-mono"
        />
      </CardContent>
      {trimmed && filename ? (
        <CardFooter>
          <ConfirmAction
            label="Delete asset"
            triggerVariant="destructive"
            destructive
            confirmWith={filename}
            title="Remove this asset?"
            description={`Deletes ${filename} from the bucket in that URL. There is no undo.`}
            consequences={[
              "The original file, so nothing can regenerate a derivative from it.",
              "Every cached transform of it, whatever size or format was requested.",
              "The freed storage is credited back to the account that owns the bucket.",
              "The owner is resolved from the bucket id in the URL, not from anything typed here.",
            ]}
            confirmLabel="Delete asset"
            onConfirm={async () => {
              await adminFetch("/admin/asset", {
                method: "DELETE",
                body: JSON.stringify({ ref: trimmed }),
              });
              toast.success("Asset removed");
              setRef("");
            }}
          />
        </CardFooter>
      ) : null}
    </Card>
  );
}
