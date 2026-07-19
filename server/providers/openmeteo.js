// server/providers/openmeteo.js — clima das regiões produtoras de soja (gratuito, sem chave).
//
// Usa a Archive API do Open-Meteo (open-meteo.com) para a chuva diária. Para cada
// região calcula:
//   - atual  : chuva acumulada nos últimos 30 dias (mm)
//   - media  : média histórica da mesma janela de 30 dias nos últimos ~10 anos
//   - varPct : desvio do atual em relação à média
//   - status : "ok" | "atencao" | "seca" conforme o desvio
// Tudo cacheado por 12 h (clima muda devagar).

const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" };
const TTL_MS = 12 * 60 * 60 * 1000;
let cache = null; // { ts, out }

// Principais regiões da soja brasileira (uma cidade representativa de cada).
const REGIOES = [
  { nome: "Médio-Norte MT", cidade: "Sorriso/MT", lat: -12.55, lon: -55.72 },
  { nome: "Sudoeste Goiano", cidade: "Rio Verde/GO", lat: -17.79, lon: -50.92 },
  { nome: "Sul de MS", cidade: "Dourados/MS", lat: -22.22, lon: -54.81 },
  { nome: "Oeste do Paraná", cidade: "Cascavel/PR", lat: -24.96, lon: -53.46 },
  { nome: "Planalto Gaúcho", cidade: "Passo Fundo/RS", lat: -28.26, lon: -52.41 },
  { nome: "MATOPIBA", cidade: "Balsas/MA", lat: -7.53, lon: -46.04 },
];

const iso = (d) => d.toISOString().slice(0, 10);

function statusPorDesvio(varPct) {
  if (varPct == null) return "ok";
  if (varPct >= -10) return "ok";
  if (varPct >= -30) return "atencao";
  return "seca";
}

// Soma a chuva na janela de `dias` que termina no índice `fim` (inclusive).
function somaJanela(precs, fim, dias) {
  let s = 0;
  let n = 0;
  for (let i = Math.max(0, fim - dias + 1); i <= fim; i++) {
    if (precs[i] != null) {
      s += precs[i];
      n++;
    }
  }
  return n ? s : null;
}

async function umaRegiao(r) {
  const fim = new Date();
  const ini = new Date(fim.getFullYear() - 11, 0, 1);
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${r.lat}&longitude=${r.lon}` +
    `&start_date=${iso(ini)}&end_date=${iso(fim)}&daily=precipitation_sum&timezone=America%2FSao_Paulo`;
  const resp = await fetch(url, { headers: UA });
  if (!resp.ok) throw new Error(`Open-Meteo HTTP ${resp.status}`);
  const j = await resp.json();
  const datas = j?.daily?.time || [];
  const precs = j?.daily?.precipitation_sum || [];
  if (!datas.length) throw new Error("Open-Meteo sem dados");

  // Último dia com leitura válida.
  let ultimo = precs.length - 1;
  while (ultimo > 0 && precs[ultimo] == null) ultimo--;

  const atual = somaJanela(precs, ultimo, 30);

  // Média histórica: mesma janela de 30 dias terminando no mesmo mês/dia nos anos anteriores.
  const alvo = datas[ultimo]; // "AAAA-MM-DD"
  const mmdd = alvo.slice(5);
  const anoAtual = Number(alvo.slice(0, 4));
  const somas = [];
  for (let i = 0; i < datas.length; i++) {
    if (datas[i].slice(5) === mmdd && Number(datas[i].slice(0, 4)) < anoAtual) {
      const s = somaJanela(precs, i, 30);
      if (s != null) somas.push(s);
    }
  }
  const media = somas.length ? somas.reduce((a, b) => a + b, 0) / somas.length : null;
  const varPct = media ? ((atual - media) / media) * 100 : null;

  return {
    nome: r.nome,
    cidade: r.cidade,
    ate: alvo,
    atual: atual == null ? null : Math.round(atual * 10) / 10,
    media: media == null ? null : Math.round(media * 10) / 10,
    varPct: varPct == null ? null : Math.round(varPct * 10) / 10,
    status: statusPorDesvio(varPct),
    anos: somas.length,
  };
}

export async function getClima() {
  if (cache && Date.now() - cache.ts < TTL_MS) return cache.out;
  const res = await Promise.allSettled(REGIOES.map(umaRegiao));
  const regioes = res.filter((x) => x.status === "fulfilled").map((x) => x.value);
  if (!regioes.length) throw new Error("Clima indisponível no momento");
  const out = { fonte: "Open-Meteo (chuva)", fetchedAt: new Date().toISOString(), regioes };
  cache = { ts: Date.now(), out };
  return out;
}
