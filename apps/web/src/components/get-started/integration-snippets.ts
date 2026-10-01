/**
 * What the Integrate page hands over, prefilled with this instance's API URL -
 * a snippet the user has to go and substitute values into is just
 * documentation with extra steps.
 *
 * None of them ever contains the API key. Openinary keys are secret (they mint
 * upload signatures), so the key belongs in the backend's .env and the browser
 * only ever sees the short-lived signature - which is exactly what
 * `POST /upload/sign` returns and what the FileUploader expects.
 */

export interface SnippetContext {
  /** This instance's API URL, e.g. https://media.example.com/api */
  apiBaseUrl: string;
}

export function aiPrompt({ apiBaseUrl }: SnippetContext) {
  return `# Integrate Openinary

Wire file uploads and media delivery into this project using a self-hosted
Openinary instance.

## 1 - Values

- API URL:   ${apiBaseUrl}
- Delivery:  ${apiBaseUrl}/t/<path>

OPENINARY_API_KEY is the one value only the user has. It mints upload
signatures, so it is a secret: backend environment only. Never a NEXT_PUBLIC_*
variable, never client code, never the repository.

## 2 - Scan, then ask once

Inspect the repository and report, without editing yet: framework and router;
package manager, from the lockfile (use it, do not add a second); where server
routes live and how secrets are read; and the component or form where users
should pick files. If the project has no UI at all - a fresh scaffold, a
backend - do not stop for that alone: default to a new /upload route, say that
you did, continue.

Then send ONE message with every open question, and ask the user to write
OPENINARY_API_KEY into the backend environment themselves. Never have them
paste it into this chat, where it would persist in the transcript. Confirm the
env file is gitignored. Stop there; do not write code while waiting.

## 3 - Install the uploader

Read https://docs.openinary.dev/guides/file-uploader.md - it has the props,
the prerequisites on the instance (API_SECRET, CORS_ORIGIN) and the
signing-route examples per framework. Two registry items:

  npx shadcn@latest add @openinary/file-uploader   # component + hook
  npx shadcn@latest add @openinary/upload-token    # lib/upload-token.ts

  <FileUploader
    baseUrl="${apiBaseUrl}"
    sign={async () => {
      const res = await fetch("/api/openinary/sign", { method: "POST" });
      if (!res.ok) throw new Error("Could not sign upload");
      return res.json();
    }}
    onSuccess={(files) => { /* files[].path - step 5 */ }}
  />

That page assumes shadcn, which this project may not have. If there is no
components.json, or no Button and Progress in it, do NOT run \`shadcn init\`:
it would restructure a project that never asked for it. Do not add
lucide-react either. No new dependency. Take use-file-upload.ts ALONE,
verbatim, from the registry JSON, which carries each file's target and its
full content:

  https://openinary.dev/r/file-uploader.json

Then build the UI this codebase would have written anyway on the hook alone,
and skip file-uploader.tsx. The hook returns \`files\` - each entry carrying
\`status\`, \`progress\`, \`error\` and \`previewUrl\` - plus \`isUploading\`,
\`addFiles\`, \`removeFile\`, \`upload\`, \`retry\`, \`abort\` and \`clear\`. That is
the whole UI. The hook may not satisfy this project's linter; leave it exactly
as shipped, it is vendored source, and mention it in your report.

## 4 - The signing route

The browser must never hold the API key, so the server mints a short-lived
signature. \`signUpload()\` makes that call; you write the route around it, in
this project's framework. Three things it will not do for you:

- Fix the folder server-side, from the authenticated user. A folder read from
  the request body is a folder any visitor can choose.
- Authenticate the route with whatever this app already uses - it is an upload
  grant. Put it where that auth already lives: with a separate frontend and
  API, it belongs in the API, not in the app that renders the uploader. If
  there is no auth at all, do not build one. Reject unless \`Sec-Fetch-Site\`
  is \`same-origin\` or \`same-site\` - accept both, or a frontend calling
  api.example.com fails - leave a TODO where the real check goes, and tell the
  user plainly that an origin check is not authentication.
- Add this app's origin to CORS_ORIGIN on the instance. The browser uploads
  to the instance directly, so an origin it does not list is refused before
  the file is even sent. That is the user's to set: say so, do not guess at
  their deployment.

## 5 - Store the path, render the original

\`onSuccess\` hands you \`files[].path\`. Persist THAT, not a URL, and give it a
destination explicitly: the form field, the state or the column where this
project already keeps such a value. If there is genuinely nowhere, say so and
show the path in the page. Do not build a gallery because the value had
nowhere to go.

Every delivery URL goes through /t/. To show the file that was just uploaded,
use the bare form, with no transformation segment:

  ${apiBaseUrl}/t/<path>

Render it ONCE, and never swap it for another URL. That form is served
straight from storage, so it renders on the first try, every time. Image
transformations are processed inline, but a video transformation is generated
on demand - the first request for one answers 202 {"status":"processing"}
rather than bytes - so swapping a transformed URL in once the page already
shows something is the single thing that makes an integration look broken.

Three limits on that image: ONE image, the upload that just happened, never a
gallery; only what a browser decodes - jpg, png, webp, avif, gif, so a .heic,
a .psd or a video is a link and not an <img>; and do not also render the local
File, that second copy is the swap again.

## 6 - Verify

Run the app, upload a real file through the new UI, and confirm the signing
route returns 200 with a signature, the path reaches the destination step 5
gave it, and the image DECODES on the first try - naturalWidth > 0, no retry,
no flicker. If you needed a retry to see it, you are not on the original;
re-read step 5.

No file picker you can drive? Inject the file rather than give up:

    const dt = new DataTransfer();
    dt.items.add(new File([blob], "test.png", { type: "image/png" }));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));

Cannot reach the UI at all - a login you cannot pass, no browser? Sign, POST
\`signature\`, \`expires\`, \`folder\` and \`files\` as multipart to
${apiBaseUrl}/upload, exactly as the signing call returned them, then GET
the returned path under /t/. If you cannot run the project at all, say so
explicitly and list these as manual steps. Never report the integration as
verified without an actual upload.

## 7 - Beyond this

Transformations, deleting a file, video and error shapes:
https://docs.openinary.dev/api-reference/introduction.md, with the full page
index at https://docs.openinary.dev/llms.txt. This is a self-hosted instance:
skip the pages under /cloud, they describe Openinary Cloud.

## Guardrails

- Smallest safe change. Follow this project's structure and conventions; no
  unrelated refactoring.
- The API key stays server-side. If you catch yourself putting it in client
  code, stop and re-read step 4.
- State any assumption you had to make, or say there were none.
- State anything you could NOT verify, and why. A partial verification
  reported as complete is worse than an honest gap.
`;
}
