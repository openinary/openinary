---
"@openinary/ui": minor
---

Percent-encode storage paths in every URL the package builds.

Paths were interpolated raw into the `/t/` delivery, preview and thumbnail
URLs and into the `/video-status` poll, so a filename containing `#` or `?`
truncated the URL: the browser read everything after it as a fragment or
query, and the request that reached the server was for the part before it.
A video uploaded as `The #1 clip.mp4` was fetched as `The ` and 404'd, with
no broken thumbnail to explain why.

The one-off `split("/").map(encodeURIComponent).join("/")` that the API calls
already used is now a single exported `encodePath` helper, used everywhere a
path becomes part of a URL.
