---
"@openinary/core": patch
---

Storage: only a real 404 marks an object as missing — transient S3 errors (timeouts, throttling, cold-start TLS resets) are no longer cached as "file not found" for the negative-cache TTL. Video resize: a single dimension is enough (`w_303` alone works), `setsar=1` on every branch so non-square-SAR sources display at the requested shape, dimensions rounded to even numbers for h264.
