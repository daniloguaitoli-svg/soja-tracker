// server/providers/bcb.js — câmbio oficial do Banco Central do Brasil (gratuito).
//
// Usa as séries diárias do SGS (PTAX venda):
//   1     -> USD/BRL
//   21619 -> EUR/BRL
// Endpoint: api.bcb.gov.br/dados/serie/bcdata.sgs.{cod}/dados?formato=json
// Sem chave. Datas em dd/mm/aaaa; valores com ponto decimal.

const SERIES = { USD: 1, EUR: 21619 };
const TTL_MS = 30 * 60 * 1000;
const cache = new Map(); // cod -> { ts, pontos }

function isoDeBR(dataBR) {
  const [d, m, a] = dataBR.split("/");
  return `${a}-${m}-${d}`;
}

function ddmmyyyy(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// O endpoint "ultimos/N" do BCB rejeita N grande (HTTP 400); usamos intervalo de
// datas, que aceita ~1 ano tranquilamente.
async function serie(cod, dias = 400) {
  const hit = cache.get(cod);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.pontos;
  const ini = ddmmyyyy(new Date(Date.now() - dias * 864e5));
  const fim = ddmmyyyy(new Date());
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${cod}/dados?formato=json&dataInicial=${ini}&dataFinal=${fim}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`BCB indisponível (HTTP ${r.status})`);
  const bruto = await r.json();
  const pontos = bruto
    .map((p) => ({ date: isoDeBR(p.data), close: Number(p.valor) }))
    .filter((p) => Number.isFinite(p.close));
  cache.set(cod, { ts: Date.now(), pontos });
  return pontos;
}

// Cotação atual + variação do dia de uma moeda.
async function cotacao(moeda) {
  const pontos = await serie(SERIES[moeda]);
  const ult = pontos[pontos.length - 1];
  const ant = pontos[pontos.length - 2] || ult;
  const change = ult.close - ant.close;
  return {
    moeda,
    valor: ult.close,
    change,
    changePct: ant.close ? (change / ant.close) * 100 : 0,
    data: ult.date,
    pontos,
  };
}

// USD atual (número puro) para conversões — com fallback nulo tolerante.
export async function usdbrl() {
  try {
    return (await cotacao("USD")).valor;
  } catch {
    return null;
  }
}

export async function getCambio() {
  const [usd, eur] = await Promise.allSettled([cotacao("USD"), cotacao("EUR")]);
  return {
    fonte: "Banco Central do Brasil (PTAX)",
    fetchedAt: new Date().toISOString(),
    usd: usd.status === "fulfilled" ? usd.value : null,
    eur: eur.status === "fulfilled" ? eur.value : null,
  };
}

export async function serieUSD() {
  try {
    return await serie(SERIES.USD);
  } catch {
    return [];
  }
}
