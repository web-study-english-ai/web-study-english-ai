import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
};

export default withSentryConfig(nextConfig, {
  // Suppress logs unless explicitly debugging
  silent: true,
  // Disable uploading source maps if auth token is not available
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});

