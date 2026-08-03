import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  {
    rules: {
      // any 쓰는 거 막는 룰 끄기
      "@typescript-eslint/no-explicit-any": "off",

      // 필요하면 implicitAny 관련 다른 룰도 여기서 조정 가능
      // "@typescript-eslint/no-unsafe-assignment": "off",
    },
  },
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
