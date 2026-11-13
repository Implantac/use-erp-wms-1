import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";
import { directLucideImports } from "./scripts/vite-direct-lucide-imports";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    // O preview do ambiente e a rede local acessam por hosts/IPs diferentes.
    allowedHosts: true,
  },
  // Tests redirect generated code to an ignored cache so they never rewrite
  // tracked Supabase sources. Normal development/build keeps the default.
  plugins: [
    react(),
    directLucideImports(),
    mcpPlugin({ functionsDir: process.env.MCP_FUNCTIONS_DIR ?? "supabase/functions" }),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    minify: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'],
          // Naming Lucide's barrel as a manual entry would undo the direct-import optimization.
          'vendor-ui': ['recharts', 'date-fns'],
          'erp-core': ['./src/core/auth/EnterpriseContext.tsx', './src/core/layout/MainLayout.tsx'],
        }
      }
    },
    chunkSizeWarningLimit: 1000,
  }
}));
