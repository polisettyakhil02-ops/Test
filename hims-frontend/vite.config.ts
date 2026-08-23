import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * Buckets a `node_modules` module id into a named vendor chunk. Matches on
 * the literal `node_modules/<package>/` path segment (not a loose
 * substring) so e.g. `react-router-dom`/`react-hook-form` never get swept
 * into the `react`-only bucket just because their name starts with
 * "react" — this holds regardless of npm/pnpm's nesting depth, since the
 * segment always appears verbatim right before the package's own files.
 * Order matters: more specific packages are checked before the broader
 * ones they'd otherwise be caught by (`react-dom` before bare `react`).
 */
function vendorChunk(id: string): string | undefined {
  if (!id.includes("node_modules")) {
    return undefined;
  }

  if (id.includes("node_modules/react-dom/")) {
    return "vendor-react-dom";
  }
  if (id.includes("node_modules/react/") || id.includes("node_modules/scheduler/")) {
    return "vendor-react";
  }
  if (id.includes("node_modules/@tanstack/")) {
    // react-query and react-table together: same ecosystem, commonly
    // loaded on the same admin pages.
    return "vendor-tanstack";
  }
  if (id.includes("node_modules/lucide-react/")) {
    // Not currently a dependency of this project — the app renders
    // inline Unicode glyphs for icons (see components/layout/nav.config.ts)
    // rather than an icon library. Kept here so lucide-react is split
    // into its own chunk automatically the moment it's ever added,
    // instead of silently landing in the generic vendor bundle.
    return "vendor-icons";
  }

  // Everything else third-party (axios, zod, react-hook-form, react-router-dom,
  // date-fns, clsx, @hookform/resolvers, ...) shares one general vendor
  // chunk — each is small enough on its own that giving every one of them
  // a dedicated chunk would trade one large bundle for many tiny
  // round trips instead of solving the actual problem.
  return "vendor";
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: vendorChunk,
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Dev-time convenience: lets the client call same-origin "/api/..."
      // paths while the actual hims-backend runs on its own port, and
      // keeps cookies (auth) same-site so the browser will send them.
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET ?? "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
