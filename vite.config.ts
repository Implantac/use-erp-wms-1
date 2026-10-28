import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    // O preview do ambiente e a rede local acessam por hosts/IPs diferentes.
    allowedHosts: true,
  },
  plugins: [react(), mcpPlugin(), mode === "development" && componentTagger()].filter(Boolean),
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
          'vendor-ui': ['lucide-react', 'recharts', 'date-fns'],
          'erp-core': ['./src/core/auth/EnterpriseContext.tsx', './src/core/layout/MainLayout.tsx'],
        }
      }
    },
    chunkSizeWarningLimit: 1000,
  }
}));
