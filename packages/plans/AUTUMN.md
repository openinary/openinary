# Autumn configuration

What `src/index.ts` describes, as it has to be set up in Autumn. Apply it in the
**sandbox** first, test, then repeat in production. Editing a plan that already
has customers creates a new version: existing accounts stay on theirs until they
are migrated, new signups get the new one.

## Features

| ID | Type | Notes |
|---|---|---|
| `storage_mb` | metered, **non-consumable** | Existing. Free's hard cap, and the live footprint the daily job reads. |
| `image_transformations` | metered, consumable | Existing. |
| `video_processing_seconds` | metered, consumable | Existing. |
| `cdn_requests` | metered, consumable | Existing. |
| `storage_mb_days` | metered, consumable | **New.** One unit = 1 MB held for 1 day. Tracked once a day by the Worker's 07:00 cron, paid accounts only. |
| `usage_credits` | **credit system** | **New.** One credit = **$0.01**. Schema below. |

`usage_credits` credit schema (the values are asserted in `src/index.test.ts`):

| Metered feature | `credit_cost` per unit | Same thing in dollars |
|---|---|---|
| `image_transformations` | `0.04` | $0.40 / 1,000 |
| `video_processing_seconds` | `0.0166666667` | $0.01 / minute |
| `cdn_requests` | `0.0005` | $0.50 / 100,000 |
| `storage_mb_days` | `0.0001627604` | $0.05 / GB / 30-day month |

## Plans

### `free` (new version)

No base price, no card. Every item is a hard cap (no overage price).

| Feature | Included | Reset |
|---|---|---|
| `storage_mb` | 512 | none (cumulative) |
| `image_transformations` | 100 | monthly |
| `video_processing_seconds` | 300 | monthly |
| `cdn_requests` | 5,000 | monthly |

Keep `auto_enable` on: it is what puts every new account on Free.

### `early_access`, named **Pay as you go** (new version)

| Item | Setting |
|---|---|
| Base price | **$5 / month** |
| `usage_credits` | included **500** (= $5), reset monthly, then usage-based at **$0.01 per credit** |
| `storage_mb` | **unlimited** (counted, never capped; the daily job bills it through `storage_mb_days`) |

No per-feature items for transformations, video or CDN: they draw from
`usage_credits` through the credit schema.

## Migration (on the effective date)

1. Free customers on the old version: migrate to the new `free` version (nothing is charged).
2. Alpha customers who said yes: migrate to the new `early_access` version (starts the $5).
3. Alpha customers who did not answer: cancel their subscription, which drops them to Free.

Check on a sandbox customer first that migrating a paid plan updates the Stripe
subscription without a new checkout.
