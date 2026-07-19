// server/store.js — histórico "que cresce com o tempo".
//
// CEPEA, prêmio e mercado físico não têm API gratuita de série histórica. Então,
// a cada leitura, guardamos um snapshot diário (um ponto por slug por dia) num
// arquivo JSON. Localmente isso persiste em ./data/snapshots.json; na Vercel cai
// em /tmp (efêmero — o histórico reinicia em cold starts). É o melhor esforço
// possível com fontes gratuitas, e está documentado assim para o usuário.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Ancorado na localização deste módulo (server/store.js) -> <raiz>/data/…,
// para não depender do process.cwd() (que varia conforme quem inicia o servidor).
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

const ARQ = process.env.VERCEL
  ? "/tmp/soja-snapshots.json"
  : join(RAIZ, "data", "snapshots.json");

let memoria = null; // { [slug]: { [dataISO]: valor } }

async function carregar() {
  if (memoria) return memoria;
  try {
    memoria = JSON.parse(await readFile(ARQ, "utf-8"));
  } catch {
    memoria = {};
  }
  return memoria;
}

async function salvar() {
  try {
    await mkdir(dirname(ARQ), { recursive: true });
    await writeFile(ARQ, JSON.stringify(memoria), "utf-8");
  } catch {
    /* melhor esforço — em ambiente somente-leitura simplesmente não persiste */
  }
}

// Registra o valor de hoje (idempotente por dia).
export async function registrar(slug, dataISO, valor) {
  if (valor == null || !dataISO) return;
  const m = await carregar();
  m[slug] ??= {};
  if (m[slug][dataISO] !== valor) {
    m[slug][dataISO] = valor;
    await salvar();
  }
}

// Série [{date, close}] ordenada para um slug.
export async function serieSnapshots(slug) {
  const m = await carregar();
  const s = m[slug] || {};
  return Object.entries(s)
    .map(([date, close]) => ({ date, close }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}
