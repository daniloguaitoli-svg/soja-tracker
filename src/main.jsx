import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Registra o service worker (PWA) — só em produção, para não atrapalhar o dev.
// Quando uma versão nova é instalada (e já havia uma controlando a página),
// recarrega UMA vez para o usuário passar a ver a atualização automaticamente.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      // Verifica se há atualização de tempos em tempos (ex.: app aberto o dia todo).
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
      reg.addEventListener("updatefound", () => {
        const novo = reg.installing;
        if (!novo) return;
        novo.addEventListener("statechange", () => {
          // "installed" + já existe um controlador = é uma ATUALIZAÇÃO (não a
          // primeira visita). Recarrega uma única vez para carregar a versão nova.
          if (novo.state === "installed" && navigator.serviceWorker.controller) {
            if (!window.__sojaRecarregado) {
              window.__sojaRecarregado = true;
              window.location.reload();
            }
          }
        });
      });
    } catch {
      /* PWA é opcional — falha no registro não quebra o app */
    }
  });
}
