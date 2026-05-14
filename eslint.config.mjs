import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // We deliberately call setState in effects for one-shot init / route-driven
      // resets — the same pattern used throughout the Amethyst reference codebase.
      "react-hooks/set-state-in-effect": "off",
      // Covers, page images, and remote search results are dynamic remote URLs
      // — Next/Image's static optimization doesn't help here.
      "@next/next/no-img-element": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
