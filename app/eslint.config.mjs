import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

// Next.js 15 flat config: core-web-vitals plus the TypeScript recommended set.
const eslintConfig = [
  {
    ignores: [".next/**", "out/**", "build/**", "next-env.d.ts", "shots/**", "measure/**", "supabase/.temp/**"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Rows from Postgres are typed as any across the server and the views.
      // Replacing that is a rewrite of the data layer, not a lint pass.
      "@typescript-eslint/no-explicit-any": "off",
      // Interface copy uses apostrophes ("You're", "don't") on purpose.
      // Escaping them would rewrite the screens.
      "react/no-unescaped-entities": "off",
    },
  },
];

export default eslintConfig;
