// server/providers/cepea.js — fallback independente para os indicadores CEPEA.
//
// O widget público do CEPEA (cepea.org.br) devolve um document.write com uma
// tabela: Data | Produto | Valor. Para a soja: 92 = Paranaguá (ESALQ/B3),
// 12 = Paraná (CEPEA/ESALQ). Usado só se a Notícias Agrícolas falhar, para não
// perder os números-cabeça.

import { createRequire } from "node:module";
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
  const dado = { valor, data, produto: cels[1] || null, variacaoPct: null };
  cache.set(id, { ts: Date.now(), dado });
  return dado;
}

// ---------------------------------------------------------------------------
// Cache versionado (server/cepea-cache.json), alimentado pelo GitHub Actions.
//
// O cepea.org.br fica atrás de um desafio anti-bot da Cloudflare que responde
// 403 a qualquer servidor (as funções da Vercel são barradas em todas as
// regiões), mas responde normalmente a partir dos runners do GitHub. Sem isto o
// fallback do CEPEA simplesmente não existiria em produção — e ele é justamente
// a rede de proteção para quando a Notícias Agrícolas mudar o HTML.
// `require` estático (não fs) para que o rastreador de arquivos da Vercel
// inclua o JSON no pacote da função.
const require = createRequire(import.meta.url);
let versionado = null;

function lerVersionado() {
  if (versionado) return versionado;
  try {
    versionado = require("../cepea-cache.json");
  } catch {
    versionado = { atualizadoEm: null, indicadores: {}, historico: {} };
  }
  versionado.indicadores ??= {};
  versionado.historico ??= {};
  return versionado;
}

// Indicador ao vivo, com queda para o cache versionado.
export async function widgetOuCache(slug, id, fonte = "soja") {
  try {
    return { ...(await widgetCepea(id, fonte)), viaCache: false };
  } catch (e) {
    const guardado = lerVersionado().indicadores[slug];
    if (!guardado) throw e;
    return { ...guardado, variacaoPct: null, viaCache: true };
  }
}

// Série [{date, close}] acumulada pelo job — o único histórico do CEPEA que
// sobrevive a um cold start da Vercel (onde o /tmp é apagado).
export function historicoVersionado(slug) {
  const h = lerVersionado().historico[slug] || {};
  return Object.entries(h)
    .map(([date, close]) => ({ date, close }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function cacheAtualizadoEm() {
  return lerVersionado().atualizadoEm;
}
