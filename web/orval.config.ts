import { defineConfig } from "orval";

export default defineConfig({
  tracker: {
    input: "../internal/gateway/openapi.yaml",
    output: {
      mode: "single",
      target: "src/api/generated.ts",
      client: "react-query",
      httpClient: "axios",
      override: {
        mutator: {
          path: "./src/api/mutator.ts",
          name: "customInstance",
        },
      },
    },
  },
});
