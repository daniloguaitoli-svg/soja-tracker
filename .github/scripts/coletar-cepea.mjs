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

// LIMITE DE TOLERÂNCIA AO BLOQUEIO, em dias.
//
// Em 02/09/2026 a Cloudflare do CEPEA passou a devolver 403 também aos runners
// do GitHub — antes só barrava a Vercel. Uma sonda tentou seis rotas (cabeçalho
// completo de navegador, o host cepea.esalq.usp.br da USP, e o fluxo
// home-depois-widget com cookie): 403 em todas, INCLUSIVE na home. Isso é
// bloqueio por faixa de IP, não formato de requisição, e nenhum ajuste de
// cabeçalho atravessa.
//
// Falhar o job a cada execução transformava isso em dois e-mails por dia, todo
// dia, sobre uma condição já conhecida — e a fonte PRIMÁRIA deste app é a
// Notícias Agrícolas, que segue respondendo. O CEPEA aqui é reforço e histórico.
//
// Então: enquanto o cache ainda estiver dentro do prazo, um bloqueio total
// avisa alto no log e o job PASSA. Passado o prazo, aí sim falha — porque um
// bloqueio permanente é um defeito de verdade e precisa chegar até você.
const LIMITE_DIAS_BLOQUEIO = 3;

const ok = relatorio.filter((l) => l.startsWith("ok")).length;
console.log(relatorio.join("\n"));
console.log(`\n${ok}/${alvos.length} indicadores coletados.`);

if (ok > 0) {
  // `atualizadoEm` só se mexe quando ALGUMA COISA foi coletada. Antes ele era
  // reescrito em toda execução, inclusive nas que não trouxeram nada — ou seja,
  // carimbava de hoje um dado de três dias atrás, e o app mostra esse carimbo
  // ao usuário. Agora o campo quer dizer o que promete: quando os números foram
  // atualizados pela última vez.
  cache.atualizadoEm = new Date().toISOString();
  await writeFile(ARQ, JSON.stringify(cache, null, 1) + "\n", "utf-8");
  process.exit(0);
}

// Bloqueio total: não reescreve o arquivo. Sem escrita não há diff, sem diff
// não há commit, e sem commit não há deploy à toa — o cache anterior continua
// servindo o app, marcado como `viaCache`.
const desdeMs = cache.atualizadoEm ? Date.parse(cache.atualizadoEm) : NaN;
const dias = Number.isFinite(desdeMs) ? (Date.now() - desdeMs) / 86400000 : Infinity;

if (dias > LIMITE_DIAS_BLOQUEIO) {
  console.error(
    `Nenhum indicador coletado, e o cache tem ${dias === Infinity ? "nenhuma coleta anterior" : `${dias.toFixed(1)} dias`} — ` +
      `acima do limite de ${LIMITE_DIAS_BLOQUEIO}. O bloqueio do CEPEA deixou de ser passageiro.`
  );
  process.exit(1);
}

console.warn(
  `AVISO: nenhum indicador coletado (CEPEA bloqueado). O cache tem ${dias.toFixed(1)} dias, ` +
    `dentro do limite de ${LIMITE_DIAS_BLOQUEIO} — o job passa e o app segue com o cache anterior. ` +
    `Se persistir, a próxima execução depois do limite falha e avisa.`
);
