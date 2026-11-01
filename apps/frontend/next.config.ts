import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  /**
   * `next dev` only trusts the hostname it was started with (localhost) and blocks dev assets
   * from any other origin. Opening the app on 127.0.0.1 therefore served the HTML and CSS but
   * blocked the HMR socket and the dev client, so the page rendered and then never hydrated:
   * styled, and dead to every click. Both spellings of the loopback address are the same machine
   * here, so both are allowed. Hostname only — no scheme, no port.
   */
  allowedDevOrigins: ["127.0.0.1", "[::1]"],
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
