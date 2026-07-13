"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createOrderAction } from "@/lib/orders/actions";
import { Decimal, formatCurrency, formatShares } from "@/lib/money";

export interface OpenLotOption {
  id: string;
  openQuantity: string;
  costBasisPerShare: string;
  acquiredAt: string;
}

export function TradeModal({
  symbol,
  side,
  latestPrice,
  availableCash,
  openLots,
}: {
  symbol: string;
  side: "buy" | "sell";
  latestPrice: string | null;
  availableCash?: string | null;
  openLots?: OpenLotOption[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [orderType, setOrderType] = useState<"market" | "limit" | "stop">(
    "market",
  );
  const [lotSelectionMethod, setLotSelectionMethod] = useState<
    "fifo" | "lifo" | "specific"
  >("fifo");
  const [quantity, setQuantity] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function open() {
    setError(null);
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  function handleSubmit(formData: FormData) {
    formData.set("symbol", symbol);
    formData.set("side", side);
    startTransition(async () => {
      const result = await createOrderAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      close();
      router.refresh();
    });
  }

  const label = side === "buy" ? "Buy" : "Sell";

  // Estimated total: quantity x (market -> last price, limit -> limit
  // price, stop -> stop price, since that's the price the order would
  // trigger at). Only shown once both sides of the multiplication are
  // valid numbers.
  const priceForEstimate =
    orderType === "market"
      ? latestPrice
      : orderType === "limit"
        ? limitPrice
        : stopPrice;
  const isValidDecimal = (value: string) => /^\d+(\.\d+)?$/.test(value.trim());
  const estimatedTotal =
    isValidDecimal(quantity) &&
    priceForEstimate &&
    isValidDecimal(priceForEstimate)
      ? new Decimal(quantity).times(priceForEstimate)
      : null;
  const availableCashDecimal = availableCash ? new Decimal(availableCash) : null;
  const exceedsAvailableCash =
    side === "buy" &&
    estimatedTotal !== null &&
    availableCashDecimal !== null &&
    estimatedTotal.greaterThan(availableCashDecimal);

  return (
    <>
      <button
        type="button"
        onClick={open}
        className={
          side === "buy"
            ? "rounded bg-green-700 px-4 py-2 text-sm font-semibold text-white"
            : "rounded bg-red-700 px-4 py-2 text-sm font-semibold text-white"
        }
      >
        {label}
      </button>

      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
        className="fixed top-1/2 left-1/2 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-lg p-0 backdrop:bg-black/50"
      >
        <form action={handleSubmit} className="flex flex-col gap-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {label} {symbol}
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="text-gray-500"
            >
              ✕
            </button>
          </div>

          <div className="flex gap-6 text-sm text-gray-600">
            {latestPrice && <p>Last price: {formatCurrency(latestPrice)}</p>}
            {side === "buy" && availableCashDecimal && (
              <p>Available cash: {formatCurrency(availableCashDecimal)}</p>
            )}
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="grid grid-cols-3 gap-4">
            <label className="flex flex-col gap-1 text-sm">
              Quantity
              <input
                type="text"
                inputMode="decimal"
                name="quantity"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
                className="rounded border px-3 py-2"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              Order type
              <select
                name="orderType"
                value={orderType}
                onChange={(e) =>
                  setOrderType(e.target.value as "market" | "limit" | "stop")
                }
                className="rounded border px-3 py-2"
              >
                <option value="market">Market</option>
                <option value="limit">Limit</option>
                <option value="stop">Stop</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              Time in force
              <select
                name="timeInForce"
                defaultValue="day"
                className="rounded border px-3 py-2"
              >
                <option value="day">Day</option>
                <option value="gtc">Good-Til-Cancelled</option>
              </select>
            </label>

            {orderType === "limit" && (
              <label className="flex flex-col gap-1 text-sm">
                Limit price
                <input
                  type="text"
                  inputMode="decimal"
                  name="limitPrice"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  required
                  className="rounded border px-3 py-2"
                />
              </label>
            )}

            {orderType === "stop" && (
              <label className="flex flex-col gap-1 text-sm">
                Stop price
                <input
                  type="text"
                  inputMode="decimal"
                  name="stopPrice"
                  value={stopPrice}
                  onChange={(e) => setStopPrice(e.target.value)}
                  required
                  className="rounded border px-3 py-2"
                />
              </label>
            )}

            {side === "sell" && (
              <label className="flex flex-col gap-1 text-sm">
                Lot selection
                <select
                  name="lotSelectionMethod"
                  value={lotSelectionMethod}
                  onChange={(e) =>
                    setLotSelectionMethod(
                      e.target.value as "fifo" | "lifo" | "specific",
                    )
                  }
                  className="rounded border px-3 py-2"
                >
                  <option value="fifo">FIFO (default)</option>
                  <option value="lifo">LIFO</option>
                  <option value="specific">Specific lots</option>
                </select>
              </label>
            )}
          </div>

          {side === "sell" && lotSelectionMethod === "specific" && (
            <label className="flex flex-col gap-1 text-sm">
              Choose lots (ctrl/cmd-click for multiple)
              <select
                name="specificLotIds"
                multiple
                required
                className="rounded border px-3 py-2"
                size={Math.min(5, Math.max(3, openLots?.length ?? 3))}
              >
                {(openLots ?? []).map((lot) => (
                  <option key={lot.id} value={lot.id}>
                    {formatShares(lot.openQuantity)} sh @{" "}
                    {formatCurrency(lot.costBasisPerShare)} (acquired{" "}
                    {new Date(lot.acquiredAt).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </label>
          )}

          {estimatedTotal !== null && (
            <p
              className={`text-sm ${
                exceedsAvailableCash
                  ? "font-medium text-red-600"
                  : "text-gray-700"
              }`}
            >
              {formatShares(quantity)} shares &times;{" "}
              {formatCurrency(priceForEstimate!)} ={" "}
              <span className="font-semibold">
                {formatCurrency(estimatedTotal)}
              </span>
              {side === "buy" ? " total" : " estimated proceeds"}
              {exceedsAvailableCash && " — exceeds available cash"}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={close}
              className="rounded px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className={
                side === "buy"
                  ? "rounded bg-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  : "rounded bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              }
            >
              {isPending ? "Submitting..." : `${label} ${symbol}`}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
