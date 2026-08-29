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

The root landing uses one browser-local recent-product preference:

1. Visiting `/press` or any `/press/**` route stores `press`.
2. Visiting `/resume` or any `/resume/**` route stores `resume`.
3. Entering `/` routes to `/press` or `/resume` from that stored value.
4. Missing, invalid, or unavailable storage leaves the user on the product chooser.

The root does not inspect authentication or plan category. Each product root owns
its authenticated redirect to its dashboard, while an explicit login or OAuth
`next` path bypasses root routing. Storage failure must never block navigation. A
`product_entry_routed` event records the chosen track, product root, and decision
reason.

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

The preference intentionally stays browser-local and is shared by users of that
browser. If account isolation or cross-device continuity becomes important, add
an account-level product preference and keep the browser value as an anonymous
and offline fallback.
