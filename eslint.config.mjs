import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

/** Phase 1: TS only (Vue SFC lint can be enabled when rules are tuned). */
export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      ".turbo/**",
      "coverage/**",
      "apps/frontend/dist/**",
      "packages/shared/dist/**",
      "*.config.js",
      "*.config.mjs",
      "*.config.ts",
    ],
  },
  {
    files: ["apps/backend/src/**/*.ts", "packages/shared/src/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["apps/frontend/src/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.browser,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
);
