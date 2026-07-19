// components/Conversor.jsx — converte preços de soja entre unidades usando o
// câmbio ao vivo, e mostra a paridade de exportação (interno × CBOT + prêmio).
import { useMemo, useState } from "react";
import { num, reais, sinal, pct } from "../format.js";

const BUSHEL_POR_SACA = 60 / 27.2155422; // ≈ 2,2046
const TON_POR_SACA = 0.06;

const UNIDADES = [
  { id: "USD_BUSHEL", nome: "US$/bushel (CBOT Chicago)" },
  { id: "USD_SACA", nome: "US$/saca 60 kg (B3)" },
  { id: "BRL_SACA", nome: "R$/saca 60 kg (CEPEA/físico)" },
  { id: "BRL_TON", nome: "R$/tonelada" },
];

function paraReaisPorSaca(valor, unidade, usd) {
  if (valor == null || !Number.isFinite(valor)) return null;
  switch (unidade) {
    case "BRL_SACA": return valor;
    case "BRL_TON": return valor * TON_POR_SACA;
    case "USD_SACA": return usd ? valor * usd : null;
    case "USD_BUSHEL": return usd ? valor * BUSHEL_POR_SACA * usd : null;
    default: return null;
  }
}
function deReaisPorSaca(reaisSaca, destino, usd) {
  if (reaisSaca == null) return null;
  const usdSaca = usd ? reaisSaca / usd : null;
  switch (destino) {
    case "BRL_SACA": return reaisSaca;
    case "BRL_TON": return reaisSaca / TON_POR_SACA;
    case "USD_SACA": return usdSaca;
    case "USD_BUSHEL": return usdSaca == null ? null : usdSaca / BUSHEL_POR_SACA;
    default: return null;
  }
}
const rotulo = { USD_BUSHEL: "US$/bushel", USD_SACA: "US$/saca", BRL_SACA: "R$/saca", BRL_TON: "R$/t" };

export function Conversor({ dados }) {
  const usd = dados.cambio.usdbrl;
  const itens = dados.categorias.flatMap((c) => c.itens);
  const cbot = itens.find((i) => i.slug === "cbot-soja");
  const cepeaPGua = itens.find((i) => i.slug === "cepea-paranagua");
  const premio = itens.find((i) => i.slug === "premio-paranagua");
  const paridadeItem = itens.find((i) => i.slug === "paridade-cbot-brl");

  const [valor, setValor] = useState(cbot ? String(cbot.valor).replace(".", ",") : "12,00");
  const [unidade, setUnidade] = useState("USD_BUSHEL");

  const v = parseFloat(String(valor).replace(/\./g, "").replace(",", "."));
  const base = useMemo(() => paraReaisPorSaca(Number.isFinite(v) ? v : null, unidade, usd), [v, unidade, usd]);

  const paridade = paridadeItem ? paridadeItem.valorBRLsaca : cbot ? cbot.valorBRLsaca : null;
  const dif = cepeaPGua && paridade != null ? cepeaPGua.valorBRLsaca - paridade : null;

  return (
    <div>
      <div className="card">
        <div className="label">Converter um preço</div>
        <div className="controls" style={{ marginTop: "var(--s3)" }}>
          <input
            className="input mono"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            aria-label="Valor"
          />
          <select className="select" value={unidade} onChange={(e) => setUnidade(e.target.value)} aria-label="Unidade de origem">
            {UNIDADES.map((u) => (
              <option key={u.id} value={u.id}>{u.nome}</option>
            ))}
          </select>
        </div>

        <div style={{ marginTop: "var(--s4)" }}>
          {UNIDADES.filter((u) => u.id !== unidade).map((u) => {
            const out = deReaisPorSaca(base, u.id, usd);
            return (
              <div className="conv-row" key={u.id}>
                <span className="muted">{u.nome}</span>
                <span className="conv-out">
                  {out == null ? "—" : num(out, u.id === "USD_BUSHEL" ? 4 : 2)}{" "}
                  <span className="muted" style={{ fontSize: 12 }}>{rotulo[u.id]}</span>
                </span>
              </div>
            );
          })}
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: "var(--s3)" }}>
          Câmbio usado: US$ 1 = R$ {usd != null ? num(usd, 4) : "—"} · 1 saca = 60 kg = {num(BUSHEL_POR_SACA, 4)} bushels
        </div>
      </div>

      <div className="section-title">Paridade de exportação</div>
      <div className="card">
        <div className="conv-row">
          <span className="muted">
            {premio ? "CBOT + prêmio Paranaguá, em R$/saca" : "Soja CBOT (Chicago) em R$/saca"}
          </span>
          <span className="conv-out">{paridade != null ? reais(paridade) : "—"}</span>
        </div>
        {premio && (
          <div className="conv-row">
            <span className="muted">— sendo o prêmio ({num(premio.valor, 4)} US$/bu)</span>
            <span className="conv-out muted" style={{ fontSize: 14 }}>{premio.valorBRLsaca != null ? `${reais(premio.valorBRLsaca)}/sc` : "—"}</span>
          </div>
        )}
        <div className="conv-row">
          <span className="muted">Soja ESALQ/B3 Paranaguá (interno)</span>
          <span className="conv-out">{cepeaPGua ? reais(cepeaPGua.valorBRLsaca) : "—"}</span>
        </div>
        <div className="conv-row" style={{ borderTop: "1px solid var(--line)", paddingTop: "var(--s2)" }}>
          <span className="muted">Diferença (interno − paridade)</span>
          <span className={`conv-out ${sinal(dif)}`}>
            {dif == null ? "—" : reais(dif)}
            {dif != null && paridade ? <span className="muted" style={{ fontSize: 12 }}> ({pct((dif / paridade) * 100)})</span> : null}
          </span>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: "var(--s2)" }}>
          Positivo = mercado interno pagando acima da paridade de exportação.
          Negativo = exportar fica mais atrativo. Aproximação didática — não considera
          custos portuários, frete e impostos.
        </p>
      </div>
    </div>
  );
}
