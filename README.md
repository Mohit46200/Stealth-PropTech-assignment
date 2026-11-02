# Shared Bill Splitter

A small app for splitting bills in a shared home. You create a home, add the people who live
there, add a bill, and the bill is split between everyone. Each member pays their own share,
and the app shows what each member still owes.

The original assignment brief is kept in [`ASSIGNMENT.md`](./ASSIGNMENT.md).

## Stack

| Part     | Tool                                                                   |
| -------- | ---------------------------------------------------------------------- |
| API      | [Hono](https://hono.dev) on Cloudflare Workers                         |
| Database | Cloudflare D1 (SQLite), binding `DB`                                   |
| Web      | React 19, Vite, TanStack Router (file routes), TanStack Query          |
| Language | TypeScript everywhere, `strict` + `noUncheckedIndexedAccess`, no `any` |
| Tests    | Vitest inside the Workers runtime (`@cloudflare/vitest-plugin`)        |
| Quality  | Biome (format + lint), `tsc --noEmit`                                  |

No validation or styling library: validation is a few small typed functions
(`api/src/http.ts`) and styling is one plain CSS file (`web/src/styles.css`), so every line is
easy to explain.

## How to run it

Requirements: **Node.js 22+** and **pnpm 10+**.

```bash
pnpm install      # install both packages (api + web) from the root
pnpm dev          # API on http://localhost:8787, web on http://localhost:5173
```

Open **http://localhost:5173**. `pnpm dev` first applies the SQL migrations to a local D1
database (stored in `api/.wrangler/`), then starts `wrangler dev` and Vite together. Vite
proxies every `/api/*` request to the Worker, so the browser only talks to one origin.

Other commands:

```bash
pnpm test         # Vitest in the Workers runtime: visible tests + my extra tests
pnpm check        # Biome format + lint (must pass)
pnpm check:fix    # let Biome fix what it can
pnpm typecheck    # tsc on both packages (must pass)
pnpm build        # production build of the web app (web/dist)
```

If pnpm says some build scripts were ignored, run `pnpm approve-builds` and allow `esbuild` and
`workerd`. To start from an empty local database, delete `api/.wrangler/` and run `pnpm dev`
again.

### Using the app

1. On the start page, **create a home** (e.g. "Flat 4B"). You are taken to the home page.
2. **Add members** in the order they joined. The order matters for the split.
3. **Add a bill** with a title and an amount in dollars (e.g. `10.00`). It is converted to whole
   cents and split between all members.
4. Press **Pay** next to a share. The share is marked paid and the "Still owed" panel updates.

The home id is shown on the home page and homes you opened are remembered on the start page,
so you can come back to them.

## Project layout

```
api/
  migrations/0001_init.sql   schema with named constraints
  src/
    index.ts                 Hono app, route mounting, JSON error handling
    http.ts                  HttpError + request body validation helpers
    split.ts                 pure function that splits cents fairly
    db.ts                    row types, row -> JSON mappers, shared queries
    routes/homes.ts          homes, members, bills of a home, balances
    routes/bills.ts          paying a share (idempotent, race-safe)
  test/
    homes|bills|payments.test.ts   visible tests (unchanged)
    split.test.ts                  unit tests for the split
    edge-cases.test.ts             validation, concurrency, cross-bill checks
web/
  src/
    main.tsx                 QueryClient + Router setup
    lib/api.ts               typed API client with timeouts and ApiError
    lib/money.ts             cents formatting + dollar string -> cents parsing
    lib/recent-homes.ts      remembers opened homes in localStorage (optional)
    routes/__root.tsx        layout, router-level error / not-found screens
    routes/index.tsx         create a home / open a home
    routes/homes.$homeId.tsx the bills page of one home
    components/              BillCard (shares + pay), MembersPanel, NewBillForm,
                             BalancesPanel, StatusViews (loading / empty / error)
```

## How it works

### Architecture and data flow

```
Browser (React + TanStack Router + TanStack Query)
   │  fetch('/api/...')  — 10s timeout, errors become ApiError
   ▼
Vite dev server  ── proxy /api ──►  Cloudflare Worker (Hono)
                                       │  validate input → HttpError(4xx) on bad input
                                       │  run SQL (prepared statements, batches)
                                       ▼
                                    D1 (SQLite) — constraints are the last line of defence
```

1. A component asks TanStack Query for data (e.g. the bills of a home). Query calls the typed
   client in `web/src/lib/api.ts`, caches the answer, and exposes `isPending` / `isError` /
   `data`, which the components turn into loading, error and empty states.
2. The Hono app validates the request, talks to D1 with bound parameters (no string-built SQL
   with user values), and maps database rows (`snake_case`) to the JSON shapes
   (`camelCase`) defined in `api/src/db.ts`.
3. Any thrown `HttpError` becomes `{ "error": "message" }` with its status. Any unexpected
   error is logged and returned as `500 { "error": "Internal server error" }`. Unknown routes
   return `404 { "error": "Not found" }`. So **every** error is JSON.

### API

| Method & path                                                     | Success                                                    | Errors                           |
| ----------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------- |
| `GET /api/health`                                                 | `200 { status: "ok" }`                                     |                                  |
| `POST /api/homes` `{ name }`                                      | `201 { id, name }`                                         | 400 bad JSON, 422 bad name       |
| `GET /api/homes/:homeId`                                          | `200 { id, name, members[] }`                              | 404                              |
| `POST /api/homes/:homeId/members` `{ name }`                      | `201 { id, homeId, name }`                                 | 404, 422                         |
| `GET /api/homes/:homeId/bills`                                    | `200 { bills: Bill[] }` (newest first)                     | 404                              |
| `POST /api/homes/:homeId/bills` `{ title, totalCents }`           | `201 Bill` with `shares`                                   | 404, 422 bad amount / no members |
| `POST /api/bills/:billId/shares/:shareId/pay` + `Idempotency-Key` | `200 Share`                                                | 400 no key, 404, 409             |
| `GET /api/homes/:homeId/balances`                                 | `200 { balances: [{ memberId, name, outstandingCents }] }` | 404                              |

The two `GET` routes for a home and its bills are extra; the web page needs them.

### Database schema (`api/migrations/0001_init.sql`)

Four tables: `homes`, `members`, `bills`, `shares`. Every constraint is **named**, so a
violation names the rule it broke.

| Constraint                           | What it stops                                                                                 |
| ------------------------------------ | --------------------------------------------------------------------------------------------- |
| `fk_members_home`, `fk_bills_home`   | a member or bill pointing at a home that does not exist                                       |
| `fk_shares_bill`, `fk_shares_member` | a share for a bill or member that does not exist                                              |
| `uq_members_home_position`           | two members of a home with the same join position (order must be strict)                      |
| `uq_shares_bill_member`              | the same member getting two shares of one bill                                                |
| `ck_bills_total_positive_integer`    | a total that is 0, negative, a decimal, or text (`typeof` check defeats SQLite type affinity) |
| `ck_shares_amount_non_negative`      | a negative or non-integer share                                                               |
| `ck_shares_paid_has_key`             | a share marked paid without the idempotency key that paid it, or the reverse                  |
| `ck_*_not_blank`                     | empty or whitespace-only names / titles                                                       |

### Part 1 — homes and members

- `POST /api/homes` validates `name` (string, trimmed, 1–100 chars) and inserts the home with a
  random UUID.
- `POST /api/homes/:homeId/members` uses **one** SQL statement:
  `INSERT INTO members ... SELECT ... FROM homes WHERE id = ?`, which computes the next join
  `position` as `MAX(position) + 1`. If the home does not exist the statement inserts 0 rows and
  the API answers `404`. Because it is one statement, the home check and the position are
  atomic, and `uq_members_home_position` guarantees two members never get the same position.

### Part 2 — bills, shares, payments, balances

**Split (`api/src/split.ts`).** Pure integer math: `base = floor(total / n)`,
`remainder = total % n`, and the first `remainder` members (by join order) get `base + 1`.
`1000` between 3 → `[334, 333, 333]`. The shares always add up to the total, and no two shares
differ by more than one cent. If the total is smaller than the number of members, some shares
are `0` (allowed by the schema).

**Create a bill.** Order of checks: home exists (`404`) → body is valid JSON (`400`) → title is
non-empty and `totalCents` is a positive safe integer of type number (`422`; so `0`, `-100`,
`10.5`, `"1000"` and `null` are refused) → the home has members (`422`). The bill and all its
shares are written with `DB.batch(...)`, which D1 runs as **one transaction**: either the bill
and every share are saved, or nothing is.

**Pay a share.** This is the part that must be safe under retries and races:

1. `Idempotency-Key` header missing or empty → `400`.
2. One **compare-and-set** statement:

   ```sql
   UPDATE shares SET paid_at = ?, idempotency_key = ?
   WHERE id = ? AND bill_id = ? AND paid_at IS NULL
   RETURNING ...
   ```

   SQLite executes writes one at a time, so if two requests race, exactly one of them matches
   `paid_at IS NULL` and gets the row back → `200`.
3. If no row was updated, the share is read again:
   - not found (or it belongs to a different bill) → `404` ("Bill not found" or "Share not found"),
   - stored key equals this key → it is a retry, answer `200` with the **stored** result (same
     `paidAt`, nothing is paid twice),
   - different key → `409 Share is already paid`.

**Balances.** One query: members `LEFT JOIN` shares, summing only unpaid shares, grouped per
member and ordered by join position. Members with no bills show `0`.

### Web page (`/homes/$homeId`)

- **Bills list** with every share (member name, amount, Paid badge or Pay button), a
  **"Still owed"** panel, a **New bill** form and a **Members** panel.
- **Loading** states show a spinner, **empty** states explain what to do next ("No bills yet"),
  **error** states show the server's message with a **Try again** button.
- **Pay:** there is no optimistic update. The share shows "Paying…" and only turns paid after
  the server confirms. If the payment fails, the share **stays unpaid** and an error is shown
  under it, with a "Retry payment" button.
- **Idempotency in the browser:** each payment attempt gets a UUID key that is kept until the
  attempt has a final answer. If a request times out or returns `500`, the retry reuses the
  same key, so even if the first request did reach the database the share is never paid twice.
  After `404`/`409` the key is dropped. A `409` shows "Someone else already paid this share" and
  the list refreshes.
- **Never crashes:** every request has a 10 second timeout; network errors, timeouts and non-JSON
  `500` bodies (e.g. an HTML page from a proxy) are turned into a readable `ApiError`. The router
  also has an `errorComponent` and `notFoundComponent` as a last safety net.
- Amounts are typed in dollars and parsed into cents with a regex
  (`/^(\d+)(?:\.(\d{1,2}))?$/`), never with float multiplication.

## Cases you must handle

| #   | Case                                      | How it is handled                                                                           |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | Home with no members                      | `POST /bills` → `422`; UI disables "Split bill" and shows a hint                            |
| 2   | Amount 0, negative, decimal, text, null   | `422` from `requirePositiveCents`; also blocked by `ck_bills_total_positive_integer`        |
| 3   | Amount that does not divide evenly        | `splitCents` gives the extra cents to the earliest members; sum always equals total         |
| 4   | Same payment request sent twice           | Same key → `200` with the stored result, paid once (`ck_shares_paid_has_key` keeps the key) |
| 5   | Two members paying the same share at once | Conditional `UPDATE ... WHERE paid_at IS NULL`: one `200`, the other `409`                  |
| 6   | Bill or share that does not exist         | `404` JSON; a share is only found through its own bill                                      |
| 7   | API returns 500 or is slow                | Client timeout + `ApiError`, error state with retry, share stays unpaid, no crash           |

Cases 4 and 5 are covered by tests that fire the requests in parallel with `Promise.all`
(`api/test/edge-cases.test.ts`).

## Decisions

1. **Compare-and-set in SQL instead of read-then-write for payments.** Reading the share, checking
   it in JavaScript and then writing it leaves a gap where two requests both see "unpaid". A
   single `UPDATE ... WHERE paid_at IS NULL RETURNING` closes that gap because the database does
   the check and the write as one step. Storing the idempotency key on the share itself (instead
   of a separate key table) keeps the "who paid it" fact and the "paid" fact in one row that
   can't disagree — `ck_shares_paid_has_key` enforces it. Trade-off: a key is scoped to one
   share, which is all the spec asks for.
2. **An explicit `position` column for member order.** Ordering by `created_at` can tie when two
   members are added in the same millisecond, and SQLite's `rowid` is an implementation detail.
   A position assigned atomically in the insert statement, backed by a `UNIQUE (home_id,
   position)` constraint, makes "the order members were added" a real, guaranteed fact — and the
   split depends on it.
3. **Validation in the API _and_ in the database, and no optimistic UI for payments.** The API
   validates for clear `422` messages; the `CHECK` constraints repeat the most important rules so
   no bug or future code path can store a bad amount. On the web side, I chose to wait for the
   server before showing a share as paid: it is a little slower to feel, but the UI can never
   show money as paid that the server rejected.

## AI usage

AI tools (Claude Code) were used to help scaffold and review this solution. Every file has been
read and can be explained line by line.
# Stealth-PropTech-assignment
