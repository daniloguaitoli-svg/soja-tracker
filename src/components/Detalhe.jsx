// components/Detalhe.jsx — tela cheia de um indicador: preço, gráfico e estatísticas.
import { useEffect, useState } from "react";
import { getDetalhe } from "../api.js";
import { AreaChart } from "./AreaChart.jsx";
import { Loading, ErroBox } from "./States.jsx";
import { num, pct, sinal, reais, dataBR } from "../format.js";

const TFS = ["1M", "3M", "6M", "1A", "5A"];
// Futuros de Chicago têm histórico por timeframe (Yahoo).
const COM_TF = ["cbot-soja", "cbot-farelo", "cbot-oleo"];

export function Detalhe({ slug, onBack }) {
  const [tf, setTf] = useState("3M");
  const [dado, setDado] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro(null);
    getDetalhe(slug, tf)
      .then((d) => vivo && setDado(d))
      .catch((e) => vivo && setErro(e.message))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [slug, tf]);

  const item = dado?.item;
  const podeTF = COM_TF.includes(slug);
  const casas = item && (item.unidade === "USD_BUSHEL" || item.unidade === "USD_LB") ? 4 : 2;

  return (
    <div>
      <button className="backlink" onClick={onBack}>← Voltar</button>

      {carregando && !dado && <Loading texto="Carregando indicador…" />}
      {erro && <ErroBox erro={erro} onRetry={() => setTf((t) => t)} />}

      {item && (
        <>
          <h2 style={{ fontFamily: "var(--display)", margin: "var(--s2) 0 0" }}>{item.nome}</h2>
          <div className="detail-head">
            <div>
              <div className="price">
                {num(item.valor, casas)} <span className="unit muted" style={{ fontSize: 16 }}>{item.moeda}</span>
              </div>
              {item.variacaoPct != null && (
                <div className={`mono ${sinal(item.variacaoPct)}`}>{pct(item.variacaoPct)} no dia</div>
              )}
              {item.unidade !== "BRL_SACA" && item.valorBRLsaca != null && (
                <div className="muted mono" style={{ fontSize: 13 }}>≈ {reais(item.valorBRLsaca)}/saca 60 kg</div>
              )}
              {item.unidade !== "BRL_TON" && item.valorBRLton != null && (
                <div className="muted mono" style={{ fontSize: 13 }}>≈ {reais(item.valorBRLton)}/tonelada</div>
              )}
              {item.desatualizado ? (
                <div style={{ marginTop: 8 }}>
                  <span className="stale">
                    ⚠ sem atualização desde {item.data ? dataBR(item.data) : "data desconhecida"}
                    {item.diasSemAtualizar != null && ` (${item.diasSemAtualizar} dias úteis)`}
                  </span>
                </div>
              ) : (
                item.data && <div className="pricedate" style={{ marginTop: 8 }}>Preço publicado em {dataBR(item.data)}</div>
              )}
            </div>
          </div>

          {podeTF && (
            <div className="tfrow">
              {TFS.map((t) => (
                <button key={t} className="chip" aria-pressed={tf === t} onClick={() => setTf(t)}>
                  {t}
                </button>
              ))}
            </div>
          )}

          {dado?.pontos?.length >= 2 ? (
            <>
              <AreaChart points={dado.pontos} color={item.variacaoPct >= 0 ? "var(--up)" : "var(--down)"} />
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                Série em {dado.unidadeSerie} · {dado.pontos.length} pontos ·{" "}
                {dataBR(dado.pontos[0].date)} → {dataBR(dado.pontos.at(-1).date)}
              </div>
            </>
          ) : (
            !carregando && <div className="note">{dado?.notaHistorico || "Sem série suficiente para o gráfico ainda."}</div>
          )}

          {dado?.estatisticas && (
            <div className="statgrid">
              <div className="stat"><div className="k">Mínima ({tf})</div><div className="v">{num(dado.estatisticas.min)}</div></div>
              <div className="stat"><div className="k">Máxima ({tf})</div><div className="v">{num(dado.estatisticas.max)}</div></div>
              <div className="stat">
                <div className="k">Variação ({tf})</div>
                <div className={`v ${sinal(dado.estatisticas.variacaoPeriodoPct)}`}>{pct(dado.estatisticas.variacaoPeriodoPct)}</div>
              </div>
            </div>
          )}

          {dado?.notaHistorico && dado?.pontos?.length >= 2 && (
            <div className="note">{dado.notaHistorico}</div>
          )}

          <div className="card" style={{ marginTop: "var(--s4)" }}>
            <div className="label">Sobre este indicador</div>
            <p style={{ margin: "8px 0 0", fontSize: 14 }}>{item.descricao || "—"}</p>
            {item.bloomberg && <span className="pill">Bloomberg: {item.bloomberg}</span>}
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Fonte: {item.fonte}</div>
          </div>
        </>
      )}
    </div>
  );
}
