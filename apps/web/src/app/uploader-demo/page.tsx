"use client";

import * as React from "react";
import { FileUploader } from "@/components/openinary/file-uploader";
import type { SignedUpload, UploadedFile } from "@/components/openinary/use-file-upload";

/**
 * Local demo / dogfood page for the @openinary/file-uploader registry component.
 * Visit /uploader-demo with the API running (NEXT_PUBLIC_API_BASE_URL) and
 * API_SECRET set on the API so /upload/sign can mint signatures.
 */
export default function UploaderDemoPage() {
  const [uploaded, setUploaded] = React.useState<UploadedFile[]>([]);

  const baseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

  const sign = React.useCallback(async (): Promise<SignedUpload> => {
    const res = await fetch("/api/upload-token", { method: "POST" });
    if (!res.ok) throw new Error("Failed to sign the upload");
    return res.json();
  }, []);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">Openinary File Uploader</h1>
        <p className="text-sm text-muted-foreground">
          Presigned-signature upload demo. Files go to the{" "}
          <code className="font-mono">uploader-demo</code> folder.
        </p>
      </div>

      <FileUploader
        baseUrl={baseUrl}
        sign={sign}
        maxFiles={10}
        onSuccess={(files) => setUploaded((prev) => [...prev, ...files])}
        onError={(err) => console.error("Upload error:", err)}
      />

      {uploaded.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Uploaded</h2>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {uploaded.map((file) => (
              <li key={file.path}>
                <a
                  href={`${baseUrl}${file.url}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-4"
                >
                  {file.path}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
