import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // src/lib/testing/integration/** falava com um Supabase real e so
    // funcionava porque existia um .env local. SEC-02 desrastreou esse
    // arquivo: como unitario, o teste vira timeout garantido. Essas duas
    // verificacoes foram migradas para tests/e2e/isolated-environment.spec.ts
    // (QA-01), onde executam contra banco real isolado e sem rede externa.
    exclude: [...configDefaults.exclude, "src/lib/testing/integration/**"],
    // SEC-02 removeu o .env versionado: a suíte unitária precisa de um
    // ambiente de teste explicito, sem depender de arquivo local nem de
    // credenciais reais. Valores sao propositalmente inertes.
    env: {
      VITE_SUPABASE_URL: "http://127.0.0.1:1",
      VITE_SUPABASE_PUBLISHABLE_KEY: "unit-test-only-key",
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
