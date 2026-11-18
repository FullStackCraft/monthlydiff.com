import type { NextConfig } from "next";

const config: NextConfig = {
  agentRules: false,
  devIndicators: false,
  async headers() {
    return ["/", "/calendar", "/issues/:id?"].map((source) => ({
      source,
      // Keep a cached HTML response from satisfying a Markdown request.
      headers: [{ key: "Netlify-Vary", value: "header=accept" }],
    }));
  },
  // The public pages are prerendered. Raw authoring files stay in the checkout.
  outputFileTracingExcludes: {
    "/*": ["./content/issues/**/*"],
  },
};

export default config;
