// server/providers/cepea.js — fallback independente para os indicadores CEPEA.
//
// O widget público do CEPEA (cepea.org.br) devolve um document.write com uma
// tabela: Data | Produto | Valor. Para a soja: 92 = Paranaguá (ESALQ/B3),
// 12 = Paraná (CEPEA/ESALQ). Usado só se a Notícias Agrícolas falhar, para não
// perder os números-cabeça.

import { parseNumBR } from "../util.js";

const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" };
const TTL_MS = 30 * 60 * 1000;
const cache = new Map(); // id -> { ts, dado }

export async function widgetCepea(id, fonte = "soja") {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.dado;
  const url = `https://www.cepea.org.br/br/widgetproduto.js.php?fonte=${encodeURIComponent(fonte)}&id_indicador%5B%5D=${id}`;
  const r = await fetch(url, { headers: UA, redirect: "follow" });
  if (!r.ok) throw new Error(`CEPEA indisponível (HTTP ${r.status})`);
  const txt = await r.text();
  const tbody = txt.match(/<tbody>([\s\S]*?)<\/tbody>/i)?.[1] || txt;
  const linha = tbody.match(/<tr>([\s\S]*?)<\/tr>/i)?.[1] || "";
  const cels = [...linha.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) =>
    c[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
  );
  const data = cels[0] || null;
  const valor = parseNumBR(cels[2]);
  if (valor == null) throw new Error("CEPEA: valor não encontrado");
  const dado = { valor, data, variacaoPct: null };
  cache.set(id, { ts: Date.now(), dado });
  return dado;
}
