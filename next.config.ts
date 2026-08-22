import { withSentryConfig } from '@sentry/nextjs';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';
import withBundleAnalyzer from '@next/bundle-analyzer';
import type { NextConfig } from 'next';

const nextConfig = (phase: string): NextConfig => {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER;
  const docsUrl = (process.env.BRI_DOCS_URL || 'https://bri-docs.vercel.app').replace(/\/$/, '');

  return {
    reactStrictMode: true,
    poweredByHeader: false,
    productionBrowserSourceMaps: true,

    turbopack: {
      root: process.cwd(),
      rules: {
        '*.svg': ['@svgr/webpack'],
        '*.mdx': ['@mdx-js/loader'],
      },
    },

    serverExternalPackages: ['sharp'],

    async rewrites() {
      return [
        { source: '/docs', destination: `${docsUrl}/docs` },
        { source: '/docs/:path*', destination: `${docsUrl}/docs/:path*` },
      ];
    },

    images: {
      formats: ['image/avif', 'image/webp'],
      remotePatterns: [
        {
          protocol: 'https',
          hostname: '**',
        },
        {
          protocol: 'http',
          hostname: '**',
        },
      ],
    },

    compiler: {
      removeConsole: !isDev
        ? {
            exclude: ['error', 'warn'],
          }
        : false,
    },

    experimental: {
      serverActions: {
        bodySizeLimit: '2mb',
      },
      optimizeCss: !isDev,
    },

    headers: async () => [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ],

    env: {
      APP_ENV: process.env.NODE_ENV || 'development',
      BUILD_TIME: new Date().toISOString(),
    },

    webpack: (config, { isServer }: { isServer: boolean }) => {
      if (!isServer) {
        if (!config.optimization) {
          config.optimization = {};
        }
        if (!config.optimization.splitChunks) {
          config.optimization.splitChunks = { cacheGroups: {} };
        } else if (!config.optimization.splitChunks.cacheGroups) {
          config.optimization.splitChunks.cacheGroups = {};
        }

        config.optimization.splitChunks.cacheGroups = {
          ...config.optimization.splitChunks.cacheGroups,
          commons: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendor',
            chunks: 'all',
          },
        };
      }
      return config;
    },
  };
};

const withBundleAnalyzerConfig = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

export default (phase: string) => {
  const baseConfig = nextConfig(phase);
  const analyzedConfig = withBundleAnalyzerConfig(baseConfig);

  return process.env.NODE_ENV === 'production'
    ? withSentryConfig(analyzedConfig, {
        silent: true,
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
      })
    : analyzedConfig;
};
