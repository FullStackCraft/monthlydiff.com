import type { NextConfig } from "next";

const config: NextConfig = {
  agentRules: false,
  devIndicators: false,
  // The public pages are prerendered. Raw authoring files stay in the checkout.
  outputFileTracingExcludes: {
    "/*": ["./content/issues/**/*"],
  },
};

export default config;
