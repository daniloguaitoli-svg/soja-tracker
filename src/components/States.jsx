// components/States.jsx — estados de carregamento, erro e vazio.

export function Loading({ texto = "Carregando cotações…" }) {
  return (
    <div className="state">
      <div className="spinner" aria-hidden="true" />
      {texto}
    </div>
  );
}

export function Skeletons({ n = 5 }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: n }).map((_, i) => (
        <div className="skeleton" key={i} />
      ))}
    </div>
  );
}

export function ErroBox({ erro, onRetry }) {
  return (
    <div className="state">
      <p>Não foi possível carregar os dados.</p>
      <p className="muted" style={{ fontSize: 12 }}>{String(erro)}</p>
      {onRetry && (
        <button className="btn btn-primary" onClick={onRetry} style={{ marginTop: 12 }}>
          Tentar de novo
        </button>
      )}
    </div>
  );
}

export function Vazio({ texto = "Nada por aqui." }) {
  return <div className="state">{texto}</div>;
}
