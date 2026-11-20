import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

// TypeScript's recommended rules, plus the two React hooks rules that catch real bugs: hooks called
// conditionally, and effects or callbacks that read a value they don't list as a dependency.
export default tseslint.config(
  { ignores: ["dist/**", ".wrangler/**", ".vinext/**", ".next/**", "next-env.d.ts", "worker-configuration.d.ts", "containers/**"] },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      // A leading underscore marks a parameter or variable that is there on purpose and not used.
      // `condition && action()` and `a ? b() : c()` are used as statements throughout the components.
      "@typescript-eslint/no-unused-expressions": ["error", { allowShortCircuit: true, allowTernary: true }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },
);
