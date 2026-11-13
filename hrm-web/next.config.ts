import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@hrm/shared'],
  poweredByHeader: false,
  // Linting runs as its own step (`pnpm lint`) with the monorepo flat config.
  eslint: { ignoreDuringBuilds: true },
  // E2E builds use a separate output dir so they never clobber the normal build.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
};

export default nextConfig;
