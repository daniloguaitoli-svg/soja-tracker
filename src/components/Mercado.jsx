// components/Mercado.jsx — mini-painel de mercado: clima por região, tabela de
// principais índices (1D/30D/12M), margem de esmagamento e gráficos comparativos.
import { useEffect, useState } from "react";
import { getMercado, getClima } from "../api.js";
import { DualChart } from "./DualChart.jsx";
import { Loading, ErroBox } from "./States.jsx";
import { num, pct, sinal, dataCurtaBR, dataBR } from "../format.js";

const CORES_STATUS = { ok: "var(--up)", atencao: "var(--accent)", seca: "var(--down)" };
const ROTULO_STATUS = { ok: "normal/úmido", atencao: "atenção", seca: "seca" };

function Clima() {
  const [clima, setClima] = useState(null);
  const [erro, setErro] = useState(null);
  useEffect(() => {
    let vivo = true;
    getClima().then((c) => vivo && setClima(c)).catch((e) => vivo && setErro(e.message));
    return () => { vivo = false; };
  }, []);

  if (erro) return <div className="note">Clima indisponível: {erro}</div>;
  if (!clima) return <div className="skeleton" style={{ height: 180 }} />;

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <table className="tbl">
        <thead>
          <tr><th>Região</th><th className="rt">Chuva 30d</th><th className="rt">Média</th><th className="rt">Var.</th><th className="ct">Status</th></tr>
        </thead>
        <tbody>
          {clima.regioes.map((r) => (
            <tr key={r.nome}>
              <td>
                <div style={{ fontWeight: 600 }}>{r.nome}</div>
                <div className="muted" style={{ fontSize: 11 }}>{r.cidade}</div>
              </td>
              <td className="rt mono">{r.atual != null ? `${num(r.atual)} mm` : "—"}</td>
              <td className="rt mono muted">{r.media != null ? `${num(r.media)} mm` : "—"}</td>
              <td className={`rt mono ${sinal(r.varPct)}`}>{r.varPct != null ? pct(r.varPct) : "—"}</td>
              <td className="ct">
                <span title={ROTULO_STATUS[r.status]} style={{
                  display: "inline-block", width: 11, height: 11, borderRadius: "50%",
                  background: CORES_STATUS[r.status] || "var(--muted)",
                }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="muted" style={{ fontSize: 11, padding: "8px 12px" }}>
        Chuva acumulada em 30 dias vs. média histórica da mesma janela (~10 anos). Fonte: {clima.fonte}.
      </div>
    </div>
  );
}

function celVar(v) {
  return <td className={`rt mono ${sinal(v)}`}>{v != null ? pct(v) : "—"}</td>;
}

export function Mercado() {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = () => {
    setCarregando(true); setErro(null);
    getMercado().then(setD).catch((e) => setErro(e.message)).finally(() => setCarregando(false));
  };
  useEffect(carregar, []);

  return (
    <div>
      <div className="section-title">Clima nas regiões produtoras de soja</div>
      <Clima />

      {carregando && !d && <Loading texto="Carregando mercado…" />}
      {erro && !d && <ErroBox erro={erro} onRetry={carregar} />}

      {d && (
        <>
          {d.crush && (
            <>
              <div className="section-title">Margem de esmagamento (crush CBOT)</div>
              <div className="card">
                <div className="big mono">
                  {num(d.crush.valor)} <span className="unit">US$/bushel</span>
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  Farelo {num(d.crush.farelo)} + Óleo {num(d.crush.oleo)} − Soja {num(d.crush.soja)} (tudo em US$/bushel).
                  Quanto a indústria ganha esmagando 1 bushel de soja em farelo e óleo — margem alta estimula o esmagamento e a demanda pelo grão.
                </div>
              </div>
            </>
          )}

          <div className="section-title">Principais índices</div>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="tbl">
              <thead>
                <tr><th>Índice</th><th className="rt">Valor</th><th className="rt">1D</th><th className="rt">30D</th><th className="rt">12M</th></tr>
              </thead>
              <tbody>
                {d.indices.map((i) => (
                  <tr key={i.nome}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{i.nome}</div>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {i.unidade}
                        {i.data && (
                          i.desatualizado
                            ? <> · <span className="stale" title={`Sem atualização desde ${dataBR(i.data)}`}>⚠ {dataCurtaBR(i.data)}</span></>
                            : <span className="pricedate"> · {dataCurtaBR(i.data)}</span>
                        )}
                      </div>
                    </td>
                    <td className="rt mono">{num(i.valor, i.unidade === "R$/US$" || i.unidade === "US$/bushel" || i.unidade === "US$/lb" ? 4 : 2)}</td>
                    {celVar(i.var1d)}{celVar(i.var30d)}{celVar(i.var12m)}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="muted" style={{ fontSize: 11, padding: "8px 12px" }}>
              30D e 12M dependem de histórico gratuito — disponíveis para os futuros de Chicago e o Dólar; “—” onde não há série.
            </div>
          </div>

          <div className="section-title">Dólar × Soja CBOT (Chicago)</div>
          <div className="card">
            <DualChart a={d.charts.usd} b={d.charts.cbot} colorA="var(--accent)" colorB="var(--up)" />
            <Legenda a="Dólar (R$/US$)" colorA="var(--accent)" b="Soja CBOT (US$/bushel)" colorB="var(--up)" />
          </div>

          <div className="section-title">Soja CBOT × CEPEA Paranaguá</div>
          <div className="card">
            {d.charts.cepea?.length >= 2 ? (
              <>
                <DualChart a={d.charts.cbot} b={d.charts.cepea} colorA="var(--up)" colorB="var(--accent)" />
                <Legenda a="Soja CBOT (US$/bushel)" colorA="var(--up)" b="CEPEA Paranaguá (R$/saca)" colorB="var(--accent)" />
              </>
            ) : (
              <div className="note">
                A linha do CEPEA cresce conforme o app roda (snapshots diários) — ainda não há pontos suficientes.
                A série da CBOT já tem histórico completo.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Legenda({ a, b, colorA = "var(--accent)", colorB = "var(--up)" }) {
  return (
    <div style={{ display: "flex", gap: 16, marginTop: 6, fontSize: 12 }}>
      <span className="muted"><span style={{ color: colorA }}>●</span> {a}</span>
      <span className="muted"><span style={{ color: colorB }}>●</span> {b}</span>
    </div>
  );
}
