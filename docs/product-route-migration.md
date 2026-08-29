# Product route migration

## Goal

Press and Resume are equal product tracks. A user entering brieFFlow should not be
sent to the Press workspace merely because Press was implemented first.

## Canonical routes

| Area | Canonical route |
| --- | --- |
| Product chooser | `/` |
| Press landing | `/press` |
| Press dashboard | `/press/dashboard` |
| Press documents | `/press/articles` |
| Press document detail | `/press/articles/:id` |
| Press writing | `/press/new`, `/press/:id/edit`, `/press/:id/final` |
| Resume landing | `/resume` |
| Resume dashboard | `/resume/dashboard` |
| Resume applications | `/resume/applications` |
| Resume writing | `/resume/write` |
| Shared account area | `/my` |

`/my` is reserved for account-level concerns. Press-owned dashboard and document
routes remain available only as compatibility redirects.

## Entry policy

The root landing resolves an authenticated user's destination in this order:

1. An explicit login or OAuth `next` path, which bypasses root routing.
2. The most recently visited `/press/**` or `/resume/**` track.
3. A product-specific `PRESS` or `CAREER` plan category.
4. No redirect. Users without a reliable signal stay on the product chooser.

Track preference is stored per browser and, when known, per user. Storage failure
must never block navigation. A `product_entry_routed` event records the chosen
track, destination, and decision reason.

## Compatibility redirects

| Legacy route | Destination |
| --- | --- |
| `/my/dashboard` | `/press/dashboard` |
| `/my/articles` | `/press/articles` |
| `/my/articles/pending` | `/press/articles` |
| `/articles/new` | `/press/new` |
| `/articles/:id/edit` | `/press/:id/edit` |
| `/articles/:id` | `/press/articles/:id` |

Redirects are permanent and preserve query parameters. Internal navigation must
use canonical routes so redirects serve bookmarks and old external links only.

## Follow-up

Browser-local preference is the first rollout because it does not require a user
schema or scheduler change. If cross-device continuity becomes important, add an
account-level product preference and keep the browser value as an anonymous and
offline fallback.
