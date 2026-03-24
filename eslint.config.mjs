import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "dist/**", "convex/_generated/**"] },
  {
    files: ["point-extension/**/*.js"],
    ignores: ["point-extension/tests/**/*.js"],
    ...eslint.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        importScripts: "readonly",
      },
    },
    rules: {
      "no-empty": "off",
      "no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["point-extension/tests/**/*.js"],
    ...eslint.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "no-empty": "off",
      "no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  ...tseslint.configs.recommended.map((c) => ({
    ...c,
    files: ["convex/**/*.ts", "tests/**/*.ts"],
  })),
  {
    files: ["convex/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: ["./convex/tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
