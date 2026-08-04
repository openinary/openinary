---
"@openinary/core": minor
---

Keep characters that break a URL out of storage keys.

Every asset is fetched through a URL built from its key, so a key holding a
`#` or a `?` can never be delivered: the browser strips the fragment or query
before the request leaves, and a video uploaded as `The #1 clip.mp4` is asked
for as `The ` and 404s on a file that is sitting right there. A literal `%` is
worse than truncation - readers decode, so `50%20off.mp4` is looked up as
`50 off.mp4`.

New `stripUrlHostile` export, applied on the way into storage: the upload and
create-folder routes, plus rename and move. Spaces and accents are untouched;
they encode and decode cleanly and always did.

This only guards new writes. Assets already stored with one of these
characters stay unreachable through a naively built URL until they are
renamed.
