# Billing & Invoicing

Internal single-tenant billing and invoicing tool. All data belongs to one
company — there are no tenant/company scoping columns anywhere by design.

**Stack:** Next.js 16 (App Router) · React 19 · Tailwind v4 · shadcn/ui ·
MongoDB + Mongoose 9 · NextAuth (Auth.js v5) with the Credentials provider.

## Setup

```bash
npm install

cp .env.example .env.local
npx auth secret          # writes AUTH_SECRET into .env.local
# then set MONGODB_URI in .env.local

npm run create-admin -- --email you@company.com --password "your-password" --name "Your Name"

npm run dev
```

Open http://localhost:3000 — you'll be redirected to `/login`.

There is no public sign-up. `npm run create-admin` is the only way to create an
account; re-running it with an existing email resets that user's password.

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run create-admin` | Creates or updates an admin user |
| `npm run verify-models` | Offline checks on the schemas and invoice arithmetic (no DB needed) |
| `npm run lint` | ESLint |

## Layout

```
src/
  auth.ts            NextAuth instance (Credentials provider, hits MongoDB)
  auth.config.ts     DB-free half of the config, shared with proxy.ts
  proxy.ts           Route protection (Next.js 16's renamed middleware)
  lib/mongodb.ts     Cached Mongoose connection
  models/            User, Client, Item, Invoice, Counter
  app/login/         Login page + sign-in server action
  app/dashboard/     Protected shell: sidebar, nav, log out
```

### A note on `proxy.ts`

In Next.js 16 the `middleware` file convention was **renamed to `proxy`**. This
file is the direct equivalent — same behavior, current filename. Tutorials
written for Next 15 and earlier will tell you to create `middleware.ts`; that
name is deprecated here.

### Two-layer route protection

`proxy.ts` verifies the session JWT and redirects anonymous requests to
`/login`, preserving where they were headed via `?callbackUrl=`. It is
instantiated from `auth.config.ts`, which imports no Mongoose and no bcrypt, so
guarding a route never opens a database connection.

`app/dashboard/layout.tsx` then calls `auth()` again in the render path. That is
the authoritative check — no dashboard page can render without a real session,
even if the proxy were bypassed.

### Money handling

Every derived amount on an invoice (line subtotals, apportioned discount, tax,
total, amount due) is computed by `recalculateInvoice()` in
`src/models/Invoice.ts` and re-derived in a `pre('validate')` hook, so totals
cannot drift from the line items they came from.

Two decisions worth knowing:

- **Tax is charged on the post-discount amount.** Taxing the pre-discount value
  would overstate GST on every discounted invoice.
- **An invoice-level discount is apportioned across lines by share of subtotal**,
  with the rounding remainder pushed onto the last line, so the per-line
  discounts always sum to the invoice discount exactly.

Line items also store a **snapshot** of the item (description, HSN/SAC, unit
price, tax rate) rather than only a reference. Editing or deleting an item later
never rewrites an invoice you already sent.

### Invoice numbering

MongoDB has no sequences, and "count documents + 1" races under concurrent
writes. `src/models/Counter.ts` uses a single atomic `findOneAndUpdate` with
`$inc`, so every invoice gets a distinct number (`INV-00001`, `INV-00002`, …).
Change the prefix with `INVOICE_PREFIX` in `.env.local`.
