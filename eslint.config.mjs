// ESLint v9 flat config for Context DNA admin (Next.js 16 + React 19)
// Uses eslint-config-next's "core-web-vitals" preset and softens rules
// likely to be noisy on a v0-generated codebase.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextCoreWebVitals = require("eslint-config-next/core-web-vitals");

export default [
  {
    ignores: [
      ".next/**",
      "dist/**",
      "dist-electron/**",
      "out/**",
      "build/**",
      "node_modules/**",
      "*.config.js",
      "*.config.mjs",
      "next-env.d.ts",
    ],
  },
  ...nextCoreWebVitals,
  {
    rules: {
      // v0-generated codebase — soften rules likely to be noisy
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-empty-object-type": "off",
      "react/no-unescaped-entities": "off",
      "react-hooks/exhaustive-deps": "warn",
      "import/no-anonymous-default-export": "off",
      "@next/next/no-img-element": "warn",
    },
  },
];
