import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "coverage/**",
      "node_modules/**",
      "Migracion/**",
      "prototypes/**",
      ".codegraph/**"
    ]
  },
  ...nextCoreWebVitals
];

export default config;
