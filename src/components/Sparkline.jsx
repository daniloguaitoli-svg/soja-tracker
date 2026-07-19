// components/Sparkline.jsx — minigráfico de tendência, sem dependências.
// Cor pela direção geral (último vs primeiro). Decorativo (oculto para leitores
// de tela); o preço e a variação % carregam a informação real.

const COLOR = { up: "var(--up)", down: "var(--down)", flat: "var(--muted)" };

export function Sparkline({ points, width = 60, height = 22, pad = 3 }) {
  if (!points || points.length < 2) {
    return <svg className="spark spark--empty" width={width} height={height} aria-hidden="true" />;
  }
  const closes = points.map((p) => (typeof p === "number" ? p : p.close));
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const innerH = height - pad * 2;
  const n = closes.length;
  const coords = closes.map((c, i) => [
    (i / (n - 1)) * width,
    pad + (innerH - ((c - min) / range) * innerH),
  ]);
  const d = coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const dir = closes[n - 1] > closes[0] ? "up" : closes[n - 1] < closes[0] ? "down" : "flat";
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="none" stroke={COLOR[dir]} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
