# Ask the ERP — Frontend

A single static HTML file — no build step, no framework, no `node_modules` to
compile. It talks to the backend over `fetch()`, driving the
interpret → resolve → confirm flow and the disambiguation/approval UI states.

## Point it at your backend

Edit `config.js` — that's the only thing you need to change. It defaults to
`http://localhost:3000`, matching `cd backend && npm start` in local dev:

```js
window.ASK_ERP_API_BASE = "https://your-backend-url.example.com";
```

Set it to `""` if you're serving the frontend from the same origin as the
backend in production (e.g. both behind one reverse proxy). Otherwise set it
to wherever `backend/` is deployed, and make sure that backend's
`CORS_ORIGIN` includes this frontend's URL (see `backend/README.md`).

## Run it locally

```bash
npm start   # zero-dependency static server on PORT (default 5173)
```

Or use literally any static file server / host — this is plain HTML/CSS/JS:

```bash
python3 -m http.server 5173
npx serve .
```

Or just open `index.html` directly in a browser — the only requirement is
that `config.js` points at a reachable backend and that backend's CORS
allows your origin (opening the file directly means origin `null`, which
most CORS setups won't allow; use a static server for anything beyond a
quick look).

## Deploying

Any static host works: GitHub Pages, Netlify, Vercel, Cloudflare Pages, S3 +
CloudFront, or just Nginx serving this folder. There's nothing to build —
upload `index.html` and `config.js` (with the URL edited) as-is.
