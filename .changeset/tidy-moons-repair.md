---
"@openinary/core": patch
---

Stop emitting Content-Length twice, and write cache entries atomically

Both had been carried as downstream patches against the published package
rather than fixed here, so every consumer that upgraded silently lost them.

`/t/*` passed the transform result's own `Content-Length` through to Hono,
which then wrote its own from the body it was handed. Two `Content-Length`
headers is a framing error (RFC 9110 8.6): undici rejects the response
outright, and a caller proxying this instance over `fetch` can be left
awaiting a response that never settles, with no status to report.

`saveToCache` wrote in place, so a concurrent `existsInCache`/`readFromCache`
could observe a half-written entry and hand back a truncated image. It now
writes a temp file and renames, which is atomic.
