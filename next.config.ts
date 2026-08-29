import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async redirects() {
    return [
      {
        source: "/my/dashboard",
        destination: "/press/dashboard",
        permanent: true,
      },
      {
        source: "/my/articles/pending",
        destination: "/press/articles",
        permanent: true,
      },
      {
        source: "/my/articles",
        destination: "/press/articles",
        permanent: true,
      },
      {
        source: "/articles/new",
        destination: "/press/new",
        permanent: true,
      },
      {
        source: "/articles/:id/edit",
        destination: "/press/:id/edit",
        permanent: true,
      },
      {
        source: "/articles/:id",
        destination: "/press/articles/:id",
        permanent: true,
      },
    ];
  },
  distDir: process.env.NEXT_DIST_DIR?.trim() || undefined,
  productionBrowserSourceMaps: true,
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
    ],
  },
  async headers() {
    return [{
      source: "/fonts/resume/:path*",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    }];
  },
};

export default nextConfig;
