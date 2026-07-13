export interface PriceChartPoint {
  asOf: Date;
  price: number;
}

const WIDTH = 800;
const HEIGHT = 240;
const PADDING = 8;
const UP_COLOR = "#16a34a"; // green-600
const DOWN_COLOR = "#dc2626"; // red-600

// A plain SVG line/area chart - deliberately not pulling in a charting
// library for one sparkline-style view. Colored by whether price went up
// or down over the plotted window.
export function PriceChart({ points }: { points: PriceChartPoint[] }) {
  if (points.length < 2) {
    return (
      <div className="flex h-60 items-center justify-center text-sm text-gray-500">
        Not enough price history yet.
      </div>
    );
  }

  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const isUp = points[points.length - 1].price >= points[0].price;
  const color = isUp ? UP_COLOR : DOWN_COLOR;

  const coords = points.map((point, index) => {
    const x =
      PADDING + (index / (points.length - 1)) * (WIDTH - PADDING * 2);
    const y =
      PADDING +
      (1 - (point.price - min) / range) * (HEIGHT - PADDING * 2);
    return [x, y] as const;
  });

  const linePath = coords
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  const areaPath = `${linePath} L${coords[coords.length - 1][0].toFixed(2)},${HEIGHT - PADDING} L${coords[0][0].toFixed(2)},${HEIGHT - PADDING} Z`;

  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="h-60 w-full"
      >
        <path d={areaPath} fill={color} opacity={0.12} />
        <path d={linePath} fill="none" stroke={color} strokeWidth={2} />
      </svg>
      <div className="flex justify-between text-xs text-gray-500">
        <span>{points[0].asOf.toLocaleString()}</span>
        <span>{points[points.length - 1].asOf.toLocaleString()}</span>
      </div>
    </div>
  );
}
