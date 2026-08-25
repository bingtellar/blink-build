import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: {
    // Allows the Stellar SDK to access the global window object
    global: 'globalThis',
  },
  // Automatically strips console.log and debuggers from the production build
  esbuild: {
    drop: ['console', 'debugger'],
  },
});