import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "dist/**", "convex/_generated/**"] },
  {
    files: ["point-extension/**/*.js"],
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
  ...tseslint.configs.recommended.map((c) => ({
    ...c,
    files: ["convex/**/*.ts"],
  })),
  {
    files: ["convex/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
