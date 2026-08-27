import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Tauri 约定：固定端口 + TAURI_ENV_ 前缀（见 tauri.conf.json build 节）
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    // Windows WebView2（Chromium 内核）为目标，无跨浏览器负担（CON-005）
    target: "chrome120",
    sourcemap: false,
  },
});
