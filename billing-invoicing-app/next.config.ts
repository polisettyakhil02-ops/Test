import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // @react-pdf/renderer resolves fonts and uses Node internals at runtime; it
  // has to stay an external CommonJS require rather than be bundled.
  serverExternalPackages: ['@react-pdf/renderer'],
}

export default nextConfig
