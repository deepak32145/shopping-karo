interface Props {
  data: number[];
  width?: number;
  height?: number;
}

/** Tiny price-history chart; last point is highlighted as "today". */
export default function Sparkline({ data, width = 96, height = 28 }: Props) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (width - 6) + 3;
    const y = height - 4 - ((v - min) / span) * (height - 8);
    return [x, y] as const;
  });
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Price over the last 12 weeks">
      <polyline points={pts.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
      <circle cx={lx} cy={ly} r="3.2" fill="var(--accent)" />
    </svg>
  );
}
