// components/DualChart.jsx — duas linhas com eixos independentes (cada série
// normalizada ao próprio mín/máx), como os gráficos comparativos do painel.
// Sem dependências.
export function DualChart({ a, b, colorA = "var(--accent)", colorB = "var(--up)", height = 150, pad = 6 }) {
  const width = 366;
  const linha = (pts, color, key) => {
    const closes = (pts ?? []).map((p) => p.close).filter((c) => c != null);
    if (closes.length < 2) return null;
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = max - min || 1;
    const innerH = height - pad * 2;
    const n = closes.length;
    const d = closes
      .map((c, i) => {
        const x = (i / (n - 1)) * width;
        const y = pad + (innerH - ((c - min) / range) * innerH);
        return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
    return <path key={key} d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />;
  };
  return (
    <svg className="areachart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="var(--text)" strokeOpacity="0.05" />
      {linha(a, colorA, "a")}
      {linha(b, colorB, "b")}
    </svg>
  );
}
