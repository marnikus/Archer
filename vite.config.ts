import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dev only: the Settings → Layers editor POSTs its preset here so it is written to
// src/game/layerPreset.json and ships with the game. Only that one file can be written,
// only with validated JSON, only from the dev server's own origin.
function layerPresetSave(): Plugin {
  const target = path.resolve(__dirname, "src/game/layerPreset.json").replace(/\\/g, "/");
  return {
    name: "layer-preset-save",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__layers", (req, res) => {
        const origin = req.headers.origin;
        if (req.method !== "POST" || (origin && new URL(origin).host !== req.headers.host)) {
          res.statusCode = 403;
          res.end("forbidden");
          return;
        }
        let body = "";
        req.on("data", (c) => {
          body += c;
          if (body.length > 200_000) req.destroy();
        });
        req.on("end", () => {
          try {
            const j = JSON.parse(body);
            const ok =
              j &&
              typeof j === "object" &&
              Object.values(j).every(
                (ctxs) =>
                  ctxs &&
                  typeof ctxs === "object" &&
                  Object.values(ctxs as object).every((o) => Array.isArray(o) && o.every((x) => typeof x === "string")),
              );
            if (!ok) throw new Error("bad preset");
            fs.writeFileSync(target, JSON.stringify(j, null, 2) + "\n");
            res.statusCode = 200;
            res.end("ok");
          } catch {
            res.statusCode = 400;
            res.end("bad request");
          }
        });
      });
    },
    // the editor already holds the new data in memory: don't reload the page when the file changes
    handleHotUpdate({ file }) {
      if (file.replace(/\\/g, "/") === target) return [];
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile(), layerPresetSave()],
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
