import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // @react-pdf/renderer resolves fonts and uses Node internals at runtime; it
  // has to stay an external CommonJS require rather than be bundled.
  serverExternalPackages: ['@react-pdf/renderer'],

  // Emit a self-contained server under .next/standalone, with only the
  // node_modules actually reached at runtime traced into it. That is what makes
  // the container image a few hundred MB instead of shipping the whole
  // dependency tree, and it means the runtime stage needs no `npm install`.
  output: 'standalone',

  // The app sits behind a reverse proxy in production; this stops Next from
  // guessing the origin from a request header an attacker controls.
  poweredByHeader: false,
}

export default nextConfig
