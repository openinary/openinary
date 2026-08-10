// eslint-config-next 16 ships flat configs directly, so they are spread in as
// they are. Routing them through FlatCompat.extends, as this file used to,
// hands a flat config to the legacy eslintrc validator, which walks the plugin
// objects and dies on their circular references ("Converting circular
// structure to JSON") before a single file is linted.
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // The codebase already marks deliberately-unused bindings with a leading
      // underscore (a destructured prop it accepts but ignores, an argument
      // kept for the signature); honour that instead of reporting them.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    ignores: [
      ".next/**",
      ".open-next/**",
      ".wrangler/**",
      "next-env.d.ts",
      "public/r/**",
    ],
  },
];

export default eslintConfig;
