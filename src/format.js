// src/format.js — formatação pt-BR de números, moeda e datas.

const nf2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf4 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

export function num(v, casas = 2) {
  if (v == null || !Number.isFinite(v)) return "—";
  return (casas > 2 ? nf4 : nf2).format(v);
}

// Valor com moeda/unidade legível.
export function preco(v, moeda) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${num(v)} ${moeda || ""}`.trim();
}

export function reais(v) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `R$ ${nf2.format(v)}`;
}

// Percentual com sinal.
export function pct(v) {
  if (v == null || !Number.isFinite(v)) return "—";
  const s = v > 0 ? "+" : "";
  return `${s}${nf2.format(v)}%`;
}

export function sinal(v) {
  if (v == null || !Number.isFinite(v) || v === 0) return "flat";
  return v > 0 ? "up" : "down";
}

// "2026-07-09T22:04..." ou "2026-07-09" -> "09/07/2026"
export function dataBR(iso) {
  if (!iso) return "";
  const d = String(iso).slice(0, 10).split("-");
  if (d.length !== 3) return String(iso);
  return `${d[2]}/${d[1]}/${d[0]}`;
}

// "2026-07-09" -> "09/07" (curta, para as linhas da lista).
export function dataCurtaBR(iso) {
  const cheia = dataBR(iso);
  return cheia ? cheia.slice(0, 5) : "";
}

export function horaBR(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
  } catch {
    return "";
  }
}
