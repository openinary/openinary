---
"@openinary/core": minor
---

Read a transform's source from a caller-supplied URL

An instance can now be told to fetch one original from a signed URL instead of
its own storage, via an `X-Openinary-Source-Url` request header on `/t/*`. It
exists for deployments where the originals belong to the end user: a control
plane holding the user's storage credentials can hand out a short-lived URL for
a single object rather than distributing the credentials themselves.

Off unless `ALLOW_REMOTE_SOURCE=true`, and that gate is deliberate. `/t/*` is a
public route, so honouring an arbitrary URL from a request header would make a
reachable instance a fetch proxy for whatever it can address — enable it only
where the transform route is not publicly reachable and every caller is
trusted. https only, and the URL is HEADed before use so an expired signature
reads as "not found" rather than surfacing later as a truncated download inside
sharp.

Covers images and video thumbnails. A full video transcode goes through the
background job queue, which downloads its own copy when it picks the job up —
possibly long after any signed URL has expired — so that path still reads from
the instance's own storage.

Nothing changes for instances that don't set the flag, and the cache is
untouched either way: only where the source bytes come from.
