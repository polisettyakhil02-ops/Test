# Frontend

React 19 + Vite. A static bundle — there is no server-side rendering and no
Node in the runtime image.

```bash
npm install
npm run dev        # :5173, proxies /api to :4000
```

The dev server proxies `/api` to the backend so the browser stays on a single
origin, which is exactly how it behaves in production behind nginx. Point the
proxy elsewhere with `VITE_API_PROXY=http://host:port npm run dev`.

## Build

```bash
npm run build      # typecheck, bundle to dist/, write 404.html
```

Two build-time variables, both inlined into the bundle (a static site has no
server to read configuration from):

| | |
| --- | --- |
| `VITE_API_URL` | The API's origin. Empty (the default) means same-origin — correct when a reverse proxy serves `/api`. Set it only when the API is on a different host. |
| `VITE_BASE` | `/` for a domain root, `/<repo>/` for a GitHub Pages project site. The router reads the same value at runtime. |

`404.html` is a copy of `index.html`. GitHub Pages serves it for any unknown
path, which is what makes a deep link like `/documents/<id>` work on a static
host.

## Layout

```
src/
  api/client.ts   the only place that talks to the API
  api/types.ts    the shapes the API returns
  lib/auth.tsx    session context
  lib/format.ts   money, dates, state codes, settlement state
  components/ui.tsx
  pages/          one file per area
  App.tsx         routes and the shell
  styles.css      the whole design system, tokens first
```

Every request goes through `api/client.ts`, so authentication, error shape and
the base URL are decided once. A 401 from anywhere clears the session and shows
the login screen rather than leaving a page of failed panels behind.

File downloads go through `fetch` rather than a plain `<a href>`: a link would
not carry the session cookie on a cross-origin request, and the download would
come back as a 401 page.

## Money

The API sends integer paise; `lib/format.ts` turns them into text with Indian
digit grouping. The browser never does arithmetic on money, so there is nothing
for a float to corrupt on the way to the screen. The one exception is the
invoice form's live total, which is labelled an estimate — the server re-prices
on save, and its figure is the one stored.

## Theme

`styles.css` defines the complete light palette as tokens on bare `:root`, then
redefines only the tokens under `prefers-color-scheme: dark`. No component rule
carries a colour of its own, so the dark theme is a token swap rather than a
second stylesheet.
