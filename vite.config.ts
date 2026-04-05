import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  root: "client",
  optimizeDeps: {
    esbuildOptions: {
      // Fix MapLibre GL v5 __publicField error — target modern browsers that support class fields natively
      target: "es2022",
    },
  },
  esbuild: {
    target: "es2022",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client/src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  server: {
    port: 5223,
    proxy: {
      "/api": {
        target: "http://localhost:3222",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: path.resolve(__dirname, "dist/client"),
    emptyOutDir: true,
  },
});
