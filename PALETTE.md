# HIMS — Color Palette

The exact colors used across `hims-frontend`, pulled directly from
`tailwind.config.js` and the shared UI components (`src/components/ui/`) —
not approximated. Two palettes exist: the **main app** (light, clinical/
neutral) and the **Control Tower** analytics dashboard (a deliberately
separate dark theme for the CEO/management app, per `ARCHITECTURE.md` Step
16).

---

## 1. Brand scale — custom, defined in `tailwind.config.js`

The only non-default colors in the whole app. Everything else below is
Tailwind's stock v3.4 palette, referenced by name.

| Token | Hex | Used for |
|---|---|---|
| `brand-50` | `#eff6ff` | Rarely used directly (lightest tint, reserved) |
| `brand-100` | `#dbeafe` | Rarely used directly |
| `brand-500` | `#2563eb` | Focus rings (`focus:ring-brand-500`), form field focus borders |
| `brand-600` | `#1d4ed8` | **Primary action color** — primary buttons, active nav/tab state, links |
| `brand-700` | `#1e40af` | Primary button hover state, active tab text |

```js
// tailwind.config.js — colors.brand
{
  50: "#eff6ff",
  100: "#dbeafe",
  500: "#2563eb",
  600: "#1d4ed8",
  700: "#1e40af",
}
```

## 2. Neutrals — Tailwind's default `slate` scale

The entire app's text, borders, and surfaces run on `slate`, not `gray` —
picked once and used consistently everywhere (cards, inputs, sidebar,
disabled states).

| Token | Hex | Used for |
|---|---|---|
| `slate-50` | `#f8fafc` | Zebra-row / hover backgrounds, subtle panel fills |
| `slate-100` | `#f1f5f9` | Table headers, secondary button background, badge (gray tone) background |
| `slate-200` | `#e2e8f0` | Card/input borders, dividers |
| `slate-300` | `#cbd5e1` | Outline-button borders |
| `slate-400` | `#94a3b8` | Placeholder text, disabled focus outline |
| `slate-500` | `#64748b` | Secondary/muted body text |
| `slate-600` | `#475569` | Body text on light surfaces |
| `slate-700` | `#334155` | Primary body text, badge (gray tone) text |
| `slate-900` | `#0f172a` | Headings, highest-emphasis text |

## 3. Semantic status tones — `Badge` component

Six fixed (background, text) pairs, one per `BadgeTone` — used everywhere
a status pill appears (ticket status, PO/GRN status, triage priority,
payment status, etc.):

| Tone | Background | Text | Hex (bg / text) |
|---|---|---|---|
| `green` | `emerald-100` | `emerald-800` | `#d1fae5` / `#065f46` |
| `blue` | `blue-100` | `blue-800` | `#dbeafe` / `#1e40af` |
| `red` | `red-100` | `red-800` | `#fee2e2` / `#991b1b` |
| `yellow` | `amber-100` | `amber-800` | `#fef3c7` / `#92400e` |
| `gray` | `slate-100` | `slate-700` | `#f1f5f9` / `#334155` |
| `purple` | `purple-100` | `purple-800` | `#f3e8ff` / `#6b21a8` |

## 4. Button variants

| Variant | Background | Hover | Text |
|---|---|---|---|
| `primary` | `brand-600` `#1d4ed8` | `brand-700` `#1e40af` | white |
| `secondary` | `slate-100` `#f1f5f9` | `slate-200` `#e2e8f0` | `slate-900` `#0f172a` |
| `danger` | `red-600` `#dc2626` | `red-700` `#b91c1c` | white |
| `ghost` | transparent | `slate-100` `#f1f5f9` | `slate-700` `#334155` |
| `outline` | white | `slate-50` `#f8fafc` | `slate-700` `#334155`, border `slate-300` `#cbd5e1` |

## 5. High-acuity accent colors (used ad hoc, one module each)

A few clinical screens use a single saturated accent beyond the palette
above, always sparingly and always for genuine clinical urgency:

| Color | Hex | Used for |
|---|---|---|
| Triage RED | `red-600` `#dc2626` (header), `red-50`/`red-400` card | `TriagePriority.RED` on the ER Triage Board |
| Triage YELLOW | `amber-500` `#f59e0b` (header), `amber-50`/`amber-400` card | `TriagePriority.YELLOW` |
| Triage GREEN | `emerald-600` `#059669` (header), `emerald-50`/`emerald-400` card | `TriagePriority.GREEN` |
| Triage BLACK | `slate-900` `#0f172a` (header), `slate-100`/`slate-500` card | `TriagePriority.BLACK` (deceased/expectant) |
| Partograph alert line | `#f59e0b` (amber-500) | Obstetric EMR partograph chart |
| Partograph action line | `#dc2626` (red-600) | Obstetric EMR partograph chart |
| Growth chart — weight | `#2563eb` (blue-600) | Pediatric EMR growth chart |
| Growth chart — height | `#059669` (emerald-600) | Pediatric EMR growth chart |
| Growth chart — head circumference | `#d97706` (amber-600) | Pediatric EMR growth chart |

---

## 6. Control Tower — dark analytics theme

`src/pages/analytics/ControlTower.tsx` is a deliberately separate dark
palette for the CEO/management dashboard — high-contrast chart colors on a
near-black ground, distinct from the light clinical app above:

| Token | Hex | Used for |
|---|---|---|
| Background | `slate-950` `#020617` | Page background |
| Panel | `slate-900/60` (60% `#0f172a`) | Card/panel fill |
| Panel border | `slate-800` `#1e293b` | Card borders, chart grid lines |
| Tooltip background | `#0f172a` | Chart tooltip fill |
| Body text | `slate-100` `#f1f5f9` | Primary text on dark ground |
| Axis text | `slate-500` `#64748b` | Chart axis labels |
| Accent | `#38bdf8` (sky-400) | Primary chart line/series color |
| Good | `#34d399` (emerald-400) | Positive metrics (e.g. healthy profitability) |
| Warn | `#fbbf24` (amber-400) | Caution-range metrics |
| Bad | `#f87171` (red-400) | Negative/critical metrics (e.g. high infection rate) |

```js
// ControlTower.tsx
const ACCENT = "#38bdf8"; // sky-400
const GOOD = "#34d399";   // emerald-400
const WARN = "#fbbf24";   // amber-400
const BAD = "#f87171";    // red-400
const GRID = "#1e293b";   // slate-800
const AXIS = "#64748b";   // slate-500
```

---

## Exporting into another tool

- **Figma / design tool**: paste the hex table above directly, or import
  `palette.json` (exported alongside this file) as color tokens.
- **Another Tailwind project**: copy the `colors.brand` block in section 1
  into your own `tailwind.config.js`; everything else is already Tailwind's
  stock palette, so referencing `slate-*`/`emerald-*`/`amber-*`/`red-*`/
  `blue-*`/`purple-*`/`sky-*` by name reproduces it exactly.
