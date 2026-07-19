// components/AreaChart.jsx — gráfico de área + linha, sem dependências.
// Irmão maior do Sparkline: gradiente sob a linha e gridlines fracas.
import { useId } from "react";

export function AreaChart({ points, height = 170, pad = 6, color = "var(--accent)", gridLines = 3 }) {
  const gid = useId();
  const width = 366;
  const closes = (points ?? []).map((p) => (typeof p === "number" ? p : p.close));
  if (closes.length < 2) {
    return <svg className="areachart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true" />;
  }
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const innerH = height - pad * 2;
  const n = closes.length;
  const x = (i) => (i / (n - 1)) * width;
  const y = (c) => pad + (innerH - ((c - min) / range) * innerH);
  const line = closes.map((c, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(c).toFixed(1)}`).join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  const grid = Array.from({ length: gridLines }, (_, i) => ((i + 1) / (gridLines + 1)) * height);
  return (
    <svg className="areachart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.24" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {grid.map((gy, i) => (
        <line key={i} x1="0" y1={gy} x2={width} y2={gy} stroke="var(--text)" strokeOpacity="0.05" />
      ))}
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
