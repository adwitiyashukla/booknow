import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * Standalone output emits a self-contained server bundle, which is what
   * keeps the Docker runtime image small. It is opt-in rather than always on,
   * because `next start` cannot serve a standalone build, so leaving it
   * enabled would break the ordinary local production run. The Dockerfile
   * sets BUILD_STANDALONE=true; nothing else needs to.
   */
  output: process.env.BUILD_STANDALONE === 'true' ? 'standalone' : undefined,
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'images.unsplash.com' }],
    formats: ['image/avif', 'image/webp'],
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
