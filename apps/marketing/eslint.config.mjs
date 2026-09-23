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
    // Vendored verbatim from the Dice UI registry. They track previous values
    // by mutating refs during render and size themselves from a layout effect,
    // which the React 19 rules reject but which is upstream's design, not ours.
    // Rewriting their internals would fork 1,800 lines we do not execute: the
    // form-integration path these rules fire on only runs inside a <form>, and
    // the colour picker on the homepage is controlled React state.
    //
    // Scoped to these two files by name so anything we write under
    // components/ui stays fully linted.
    files: [
      "components/ui/color-picker.tsx",
      "components/visually-hidden-input.tsx",
      "lib/compose-refs.ts",
    ],
    rules: {
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/use-memo": "off",
      "react-hooks/exhaustive-deps": "off",
      "@typescript-eslint/no-empty-object-type": "off",
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
