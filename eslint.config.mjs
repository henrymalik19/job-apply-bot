import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsdoc from "eslint-plugin-jsdoc";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Every exported function, class, type and interface carries a TSDoc comment.
  {
    files: ["app/**/*.{ts,tsx}", "server/**/*.ts", "shared/**/*.ts", "workers/**/*.ts", "proxy.ts"],
    ignores: ["**/*.test.ts", "server/db/database.types.ts"],
    plugins: { jsdoc },
    rules: {
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: true,
          require: { FunctionDeclaration: true, ClassDeclaration: true, ArrowFunctionExpression: true },
          contexts: ["TSTypeAliasDeclaration", "TSInterfaceDeclaration", "TSEnumDeclaration"],
          checkConstructors: false,
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
