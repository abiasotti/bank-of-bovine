"use client";

import { useMemo } from "react";
import { useLiveQuotes } from "@/lib/hooks/useLiveQuotes";
import { PriceChart } from "@/components/PriceChart";

export interface PricePoint {
  asOf: string; // ISO
  price: number;
}

export function LiveChart({
  symbol,
  initialPoints,
}: {
  symbol: string;
  initialPoints: PricePoint[];
}) {
  const liveQuotes = useLiveQuotes([symbol]);
  const live = liveQuotes[symbol];

  const points = useMemo(() => {
    if (!live) return initialPoints;
    const lastPoint = initialPoints[initialPoints.length - 1];
    if (lastPoint && lastPoint.asOf === live.asOf) return initialPoints;
    return [...initialPoints, { asOf: live.asOf, price: Number(live.price) }];
  }, [live, initialPoints]);

  return (
    <PriceChart
      points={points.map((p) => ({ asOf: new Date(p.asOf), price: p.price }))}
    />
  );
}
