// .github/scripts/coletar-cepea.mjs — coleta os indicadores do CEPEA e versiona
// o resultado em server/cepea-cache.json.
//
// POR QUE ISTO EXISTE: o cepea.org.br fica atrás da Cloudflare com desafio
// anti-bot que barra qualquer servidor (as funções da Vercel levam 403
// "Just a moment…" em todas as regiões). A partir do runner do GitHub Actions o
// acesso funciona — a primeira requisição de cada execução costuma levar o
// desafio e as seguintes passam, por isso cada leitura tem retentativas.
//
// Aqui o CEPEA é o FALLBACK dos indicadores (a fonte primária é a Notícias
// Agrícolas). Sem este cache, esse fallback não existiria em produção. De
// quebra, o arquivo acumula um histórico versionado — que sobrevive ao /tmp
// efêmero da Vercel.

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CATALOGO } from "../../server/catalogo.js";
import { parseNumBR, isoDeBR, hojeISO } from "../../server/util.js";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARQ = join(RAIZ, "server", "cepea-cache.json");

const UA = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  "Accept-Language": "pt-BR,pt;q=0.9",
};

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Uma leitura do widget, com retentativas (o primeiro 403 é esperado).
async function lerWidget(id, fonte = "soja", tentativas = 4) {
  const url = `https://www.cepea.org.br/br/widgetproduto.js.php?fonte=${encodeURIComponent(
    fonte
  )}&id_indicador%5B%5D=${id}`;
  let ultimoErro = null;
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(url, { headers: UA, redirect: "follow" });
      const txt = await r.text();
      if (!r.ok || !txt.includes("imagenet-widget-tabela")) {
        ultimoErro = `HTTP ${r.status}${txt.includes("Just a moment") ? " (desafio Cloudflare)" : ""}`;
        await espera(1500 * (i + 1));
        continue;
      }
      const tbody = txt.match(/<tbody>([\s\S]*?)<\/tbody>/i)?.[1] || txt;
      const linha = tbody.match(/<tr>([\s\S]*?)<\/tr>/i)?.[1] || "";
      const cels = [...linha.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) =>
        c[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
      );
      const valor = parseNumBR(cels[2]);
      if (valor == null) {
        ultimoErro = "valor não encontrado na tabela";
        await espera(1500);
        continue;
      }
      return { valor, data: cels[0] || null, produto: cels[1] || null };
    } catch (e) {
      ultimoErro = `${e.name}: ${e.message}`;
      await espera(1500 * (i + 1));
    }
  }
  throw new Error(ultimoErro || "falhou");
}

const alvos = CATALOGO.filter((c) => c.cepeaId);

// Cache anterior (para acumular o histórico em vez de sobrescrever).
let cache = { atualizadoEm: null, indicadores: {}, historico: {} };
try {
  cache = JSON.parse(await readFile(ARQ, "utf-8"));
  cache.indicadores ??= {};
  cache.historico ??= {};
} catch {
  /* primeira execução */
}

const relatorio = [];
for (const cat of alvos) {
  try {
    const dado = await lerWidget(cat.cepeaId, cat.cepeaFonte || "soja");
    cache.indicadores[cat.slug] = dado;
    const iso = isoDeBR(dado.data) || hojeISO();
    cache.historico[cat.slug] ??= {};
    cache.historico[cat.slug][iso] = dado.valor;
    relatorio.push(`ok    ${cat.slug} = ${dado.valor} (${dado.produto || "?"}, ${dado.data || "sem data"})`);
  } catch (e) {
    // Mantém o valor anterior: um indicador que falhou hoje continua visível
    // com a data antiga (e o app já marca preços velhos como desatualizados).
    relatorio.push(`FALHA ${cat.slug}: ${e.message}`);
  }
  await espera(800); // gentileza com a fonte
}

cache.atualizadoEm = new Date().toISOString();
await writeFile(ARQ, JSON.stringify(cache, null, 1) + "\n", "utf-8");

const ok = relatorio.filter((l) => l.startsWith("ok")).length;
console.log(relatorio.join("\n"));
console.log(`\n${ok}/${alvos.length} indicadores coletados.`);
if (ok === 0) {
  console.error("Nenhum indicador coletado — o acesso ao CEPEA pode ter sido bloqueado.");
  process.exit(1);
}
