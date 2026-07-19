import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { getCotacoes, getDetalhe, getCambio, getMercado, getClima } from "./server/datalayer.js";

// API só de desenvolvimento: serve /api/cotacoes, /api/detalhe e /api/cambio a
// partir da mesma camada de dados que roda em produção como funções serverless
// da Vercel (api/*.js). Assim `npm run dev` já mostra preços reais.
function devApi() {
  return {
    name: "dev-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith("/api/")) return next();
        const url = new URL(req.url, "http://localhost");
        const send = (code, body) => {
          res.statusCode = code;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify(body));
        };
        try {
          if (url.pathname === "/api/cotacoes") return send(200, await getCotacoes());
          if (url.pathname === "/api/cambio") return send(200, await getCambio());
          if (url.pathname === "/api/mercado") return send(200, await getMercado());
          if (url.pathname === "/api/clima") return send(200, await getClima());
          if (url.pathname === "/api/detalhe") {
            const slug = url.searchParams.get("slug");
            if (!slug) return send(400, { error: "Faltou o parâmetro slug" });
            const tf = url.searchParams.get("tf") || "3M";
            return send(200, await getDetalhe(slug, tf));
          }
          return next();
        } catch (e) {
          return send(502, { error: e.message });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devApi()],
  server: { host: true }, // permite abrir no celular pela rede local (LAN)
});
