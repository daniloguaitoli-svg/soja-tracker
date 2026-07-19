// components/Alertas.jsx — alertas de preço simples, guardados no navegador
// (localStorage). Ao abrir, compara com as cotações atuais e marca os disparados.
import { useEffect, useMemo, useState } from "react";
import { num } from "../format.js";

const CHAVE = "soja-tracker-alertas";

function carregar() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE)) || [];
  } catch {
    return [];
  }
}

export function Alertas({ dados }) {
  const itens = useMemo(() => dados.categorias.flatMap((c) => c.itens), [dados]);
  const [alertas, setAlertas] = useState(carregar);
  const [slug, setSlug] = useState(itens[0]?.slug || "");
  const [cond, setCond] = useState("acima");
  const [alvo, setAlvo] = useState("");

  useEffect(() => {
    localStorage.setItem(CHAVE, JSON.stringify(alertas));
  }, [alertas]);

  const add = () => {
    const alvoNum = parseFloat(String(alvo).replace(",", "."));
    if (!slug || !Number.isFinite(alvoNum)) return;
    setAlertas((a) => [...a, { id: Date.now(), slug, cond, alvo: alvoNum }]);
    setAlvo("");
  };
  const remover = (id) => setAlertas((a) => a.filter((x) => x.id !== id));

  const valorAtual = (s) => itens.find((i) => i.slug === s);

  return (
    <div>
      <div className="card">
        <div className="label">Novo alerta de preço</div>
        <div className="controls" style={{ marginTop: "var(--s3)" }}>
          <select className="select" style={{ flex: 1 }} value={slug} onChange={(e) => setSlug(e.target.value)}>
            {itens.map((i) => (
              <option key={i.slug} value={i.slug}>{i.nome} ({i.moeda})</option>
            ))}
          </select>
        </div>
        <div className="controls">
          <select className="select" value={cond} onChange={(e) => setCond(e.target.value)}>
            <option value="acima">subir acima de</option>
            <option value="abaixo">cair abaixo de</option>
          </select>
          <input className="input mono" inputMode="decimal" placeholder="valor" value={alvo} onChange={(e) => setAlvo(e.target.value)} />
          <button className="btn btn-primary" onClick={add}>Adicionar</button>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>
          Os alertas ficam salvos só neste aparelho/navegador e são checados quando você abre o app.
        </p>
      </div>

      {alertas.length === 0 ? (
        <div className="state">Nenhum alerta ainda.</div>
      ) : (
        <div style={{ marginTop: "var(--s4)" }}>
          {alertas.map((a) => {
            const it = valorAtual(a.slug);
            const v = it?.valor;
            const disparado =
              v != null && (a.cond === "acima" ? v >= a.alvo : v <= a.alvo);
            return (
              <div className="row" key={a.id} style={{ cursor: "default" }}>
                <div className="rowmain">
                  <div className="rowname">{it ? it.nome : a.slug}</div>
                  <div className="rowsub">
                    {a.cond === "acima" ? "Subir acima de" : "Cair abaixo de"} {num(a.alvo)} {it?.moeda || ""}
                    {" · atual "}
                    {v != null ? num(v) : "—"}
                  </div>
                </div>
                <div className="rowprice">
                  {disparado ? <span className="pill" style={{ color: "var(--up)", borderColor: "var(--up)" }}>disparado</span>
                             : <span className="muted" style={{ fontSize: 12 }}>aguardando</span>}
                  <div>
                    <button className="backlink" style={{ fontSize: 12 }} onClick={() => remover(a.id)}>remover</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
