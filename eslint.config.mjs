import { defineConfig, globalIgnores } from "eslint/config";
import nextPlugin from "@next/eslint-plugin-next";
import tseslint from "typescript-eslint";

export default defineConfig([
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    extends: [nextPlugin.configs["core-web-vitals"]],
  },
  globalIgnores([".next/**", ".netlify/**", "out/**", "next-env.d.ts", "backend/.dist/**"]),
]);
