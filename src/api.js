// src/api.js — cliente das rotas /api (mesma origem, dev e produção).

async function getJSON(url) {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
  return j;
}

export const getCotacoes = () => getJSON("/api/cotacoes");
export const getCambio = () => getJSON("/api/cambio");
export const getMercado = () => getJSON("/api/mercado");
export const getClima = () => getJSON("/api/clima");
export const getDetalhe = (slug, tf = "3M") =>
  getJSON(`/api/detalhe?slug=${encodeURIComponent(slug)}&tf=${encodeURIComponent(tf)}`);
