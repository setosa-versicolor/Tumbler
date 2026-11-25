import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    // The game, and the character studio (studio.html) for looking at the characters up close.
    rollupOptions: { input: { main: "index.html", studio: "studio.html" } },
  },
  test: {
    environment: "node",
  },
} as never);
