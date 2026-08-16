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
| `npm run verify` | All offline checks (no DB needed) |
| `npm run verify-models` | Schema validation and invoice arithmetic |
| `npm run verify-lib` | Form validation, search escaping, DTO mapping |
| `npm run lint` | ESLint |

## Layout

```
src/
  auth.ts            NextAuth instance (Credentials provider, hits MongoDB)
  auth.config.ts     DB-free half of the config, shared with proxy.ts
  proxy.ts           Route protection (Next.js 16's renamed middleware)
  lib/mongodb.ts     Cached Mongoose connection
  models/            User, Client, Item, Invoice, Counter
  lib/validation.ts  Zod schemas shared by every form and server action
  lib/dto.ts         Mongoose document -> JSON-safe DTO mapping
  lib/metrics.ts     Dashboard aggregation queries
  lib/invoice-math.ts  Invoice arithmetic, shared by server and browser
  lib/company.ts       Your business details, read from env
  lib/pdf/             A4 invoice PDF document
  app/login/         Login page + sign-in server action
  app/dashboard/     Protected shell: sidebar, nav, log out
    page.tsx         Metrics, counts, recent invoices
    clients/         List, search, create, edit, delete
    items/           List, search, create, edit, delete
    invoices/        List, filter, create, edit, view, delete
      [id]/pdf/      Route handler that renders the A4 PDF
```

### PDF export

Each invoice has **View PDF** (opens in the browser's viewer, which is also how
you print) and **Download**. Both hit `/dashboard/invoices/<id>/pdf`; the
download button just adds `?download=1`, which flips `Content-Disposition` from
`inline` to `attachment`.

Rendering happens server-side with `@react-pdf/renderer`, so the PDF is real
vector output with selectable text — not a screenshot of the page. It paginates
automatically, repeating the table header and the footer on every page.

Your own business details (the "from" side) come from `COMPANY_*` environment
variables — single-tenant, so they are configuration rather than data. See
`.env.example`.

**The PDF says `INR 1,234.00`, not `₹1,234.00`, on purpose.** The PDF base-14
fonts use WinAnsi encoding, which has no rupee sign (U+20B9); it silently
renders as a superscript one. This was confirmed by extracting text from a
generated PDF. The web UI keeps the real symbol, since browsers have fonts that
cover it. To use `₹` in the PDF you would need to register and embed a font
that includes the glyph.

One layout gotcha worth knowing if you edit `lib/pdf/invoice-pdf.tsx`: do not
set `lineHeight` on the `Page` style. It is inherited by the absolutely
positioned footer and inflates its computed height enough that the footer
silently never renders at all. Set line spacing on the individual paragraph
blocks instead.

### Dashboard metrics

"Total revenue" is money actually received (`amountPaid`), not merely billed —
the amount billed is shown underneath as context. Cancelled invoices are
excluded from every figure: they are neither revenue nor owed.

"Overdue" is computed from the due date and the balance rather than trusting
the stored status, so an invoice that has quietly gone past due still counts
without a nightly job having to flip its status first.

Two details that would otherwise bite on a fresh install: a `$group`
aggregation over zero matching documents returns an **empty array**, so reading
`rows[0]` directly crashes on first login — `summarizeTotals()` handles that and
is covered by tests. And a recent-invoice row prefers the client-name snapshot
taken at issue time over the live record, so renaming a client never rewrites
invoices already sent.

### Why DTOs

Mongoose `.lean()` results still hold `ObjectId` and `Date` instances, which
cannot cross the server/client boundary — React rejects them with *"Only plain
objects … can be passed to Client Components"*. `lib/dto.ts` maps documents to
plain shapes before anything reaches a Client Component.

### Deleting

Deleting a **client** is refused while any invoice references it, so an invoice
can never be orphaned. Deleting an **item** is allowed: invoice lines snapshot
the item's description, price and tax rate, so past invoices are unaffected.
Because MongoDB has no cascading delete, the now-dangling `item` reference on
those lines is cleared explicitly rather than left pointing at a deleted
document.

### Search

`?q=` is turned into a case-insensitive substring regex by
`lib/search.ts`. Regex metacharacters are escaped first — otherwise a query of
`(` is invalid regex syntax and would 500 the page, and a pattern like `(a+)+`
is a denial-of-service vector.

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
`src/lib/invoice-math.ts` and re-derived in the model's `pre('validate')` hook,
so totals cannot drift from the line items they came from. **The form previews
totals in the browser using that same module**, so what you see while typing is
what the database computes on save — the maths deliberately lives outside
`models/Invoice.ts` so importing it client-side does not pull in Mongoose.

Line totals submitted by the browser are ignored on the server and recomputed
from quantity, rate and tax rate. The preview is a convenience, never the
source of truth.

Two decisions worth knowing:

- **Tax is charged on the post-discount amount.** Taxing the pre-discount value
  would overstate GST on every discounted invoice.
- **An invoice-level discount is apportioned across lines by share of subtotal**,
  with the rounding remainder pushed onto the last line, so the per-line
  discounts always sum to the invoice discount exactly.

Line items also store a **snapshot** of the item (description, HSN/SAC, unit
price, tax rate) rather than only a reference. Editing or deleting an item later
never rewrites an invoice you already sent.

### Invoice status

You pick a status on the form, but it is reconciled against the balance on save
by `derivePaymentStatus()`: fully paid becomes `paid`, part paid becomes
`partially_paid`, and unpaid past its due date becomes `overdue`. `draft` and
`cancelled` are deliberate states and are never overridden. This stops an
invoice sitting at "sent" while fully paid.

Marking an invoice paid from the detail page also settles the balance —
otherwise the dashboard would show it as paid while still counting it as
outstanding.

### Invoice numbering

MongoDB has no sequences, and "count documents + 1" races under concurrent
writes. `src/models/Counter.ts` uses a single atomic `findOneAndUpdate` with
`$inc`, so every invoice gets a distinct number (`INV-00001`, `INV-00002`, …).
Change the prefix with `INVOICE_PREFIX` in `.env.local`.
