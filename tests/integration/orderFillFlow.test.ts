import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import { getAccountBalance } from "@/lib/ledger/getAccountBalance";
import { createOrder, cancelOrder } from "@/lib/orders/orderService";
import { evaluateOrders } from "@/lib/orders/orderEvaluator";
import { createTestUser, truncateTestData } from "./testHelpers";

async function setQuote(securityId: string, price: string) {
  return prisma.quote.create({
    data: { securityId, price, asOf: new Date(), source: "mock" },
  });
}

// A fixed Wednesday 11am ET instant, safely inside regular trading hours -
// market-order fills and evaluator fills shouldn't depend on whatever real
// wall-clock time CI happens to run at.
const DURING_MARKET_HOURS = new Date("2026-07-15T15:00:00Z");
// A fixed Saturday noon ET instant - safely outside trading hours.
const OUTSIDE_MARKET_HOURS = new Date("2026-07-18T16:00:00Z");

describe("order fill flow (integration)", () => {
  afterEach(async () => {
    await truncateTestData();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("funds an account, fills a market buy into a tax lot, then a crossing GTC limit sell consumes lots FIFO with correct realized gain/loss and a consistent ledger balance", async () => {
    const { account } = await createTestUser();
    const security = await prisma.security.findUniqueOrThrow({
      where: { symbol: "AAPL" },
    });

    await setQuote(security.id, "100.00");
    const buy1 = await createOrder(
      {
        accountId: account.id,
        securityId: security.id,
        side: "buy",
        orderType: "market",
        timeInForce: "day",
        quantity: "10",
      },
      DURING_MARKET_HOURS,
    );
    expect(buy1.status).toBe("filled");
    // 500000 (starting balance) - 1000 (buy1: 10*100)
    expect((await getAccountBalance(account.id)).toString()).toBe("499000");

    await setQuote(security.id, "120.00");
    await createOrder(
      {
        accountId: account.id,
        securityId: security.id,
        side: "buy",
        orderType: "market",
        timeInForce: "day",
        quantity: "5",
      },
      DURING_MARKET_HOURS,
    );

    const lotsBeforeSell = await prisma.taxLot.findMany({
      where: { accountId: account.id, securityId: security.id },
      orderBy: { acquiredAt: "asc" },
    });
    expect(lotsBeforeSell.map((l) => l.openQuantity.toString())).toEqual([
      "10",
      "5",
    ]);

    const sellOrder = await createOrder({
      accountId: account.id,
      securityId: security.id,
      side: "sell",
      orderType: "limit",
      timeInForce: "gtc",
      quantity: "12",
      limitPrice: "110",
      lotSelectionMethod: "fifo",
    });
    expect(sellOrder.status).toBe("pending");

    await evaluateOrders(DURING_MARKET_HOURS);

    const filledSellOrder = await prisma.order.findUniqueOrThrow({
      where: { id: sellOrder.id },
    });
    expect(filledSellOrder.status).toBe("filled");

    const lotsAfterSell = await prisma.taxLot.findMany({
      where: { accountId: account.id, securityId: security.id },
      orderBy: { acquiredAt: "asc" },
    });
    // Lot 1 (10 @ 100) fully consumed; lot 2 (5 @ 120) has 2 consumed, 3 left.
    expect(lotsAfterSell.map((l) => l.openQuantity.toString())).toEqual([
      "0",
      "3",
    ]);

    const execution = await prisma.execution.findFirstOrThrow({
      where: { orderId: sellOrder.id },
    });
    // (120-100)*10 + (120-120)*2 = 200
    expect(execution.realizedGainLoss?.toString()).toBe("200");

    const lotConsumptions = await prisma.lotConsumption.findMany({
      where: { executionId: execution.id },
    });
    expect(lotConsumptions).toHaveLength(2);

    // 499000 (after buy1) - 600 (buy2: 5*120) + 1440 (sell proceeds: 12*120)
    expect((await getAccountBalance(account.id)).toString()).toBe("499840");
  });

  it("never fills a cancelled order even if a later price crosses its limit", async () => {
    const { account } = await createTestUser();
    const security = await prisma.security.findUniqueOrThrow({
      where: { symbol: "MSFT" },
    });
    await setQuote(security.id, "50.00");

    const order = await createOrder({
      accountId: account.id,
      securityId: security.id,
      side: "buy",
      orderType: "limit",
      timeInForce: "gtc",
      quantity: "1",
      limitPrice: "40",
    });
    await cancelOrder({ orderId: order.id, accountId: account.id });

    await setQuote(security.id, "30.00");
    await evaluateOrders();

    const after = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(after.status).toBe("cancelled");
  });

  it("expires day orders past their window instead of filling them", async () => {
    const { account } = await createTestUser();
    const security = await prisma.security.findUniqueOrThrow({
      where: { symbol: "TSLA" },
    });
    await setQuote(security.id, "50.00");

    const order = await createOrder({
      accountId: account.id,
      securityId: security.id,
      side: "buy",
      orderType: "limit",
      timeInForce: "day",
      quantity: "1",
      limitPrice: "40",
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await evaluateOrders();

    const after = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(after.status).toBe("expired");
  });

  it("rejects a market buy that would exceed the account's cash balance, leaving no dangling order", async () => {
    const { account } = await createTestUser();
    const security = await prisma.security.findUniqueOrThrow({
      where: { symbol: "GOOGL" },
    });
    await setQuote(security.id, "500.00");

    // 500 * 2000 = 1,000,000, well over the fixed 500,000 starting balance.
    await expect(
      createOrder(
        {
          accountId: account.id,
          securityId: security.id,
          side: "buy",
          orderType: "market",
          timeInForce: "day",
          quantity: "2000",
        },
        DURING_MARKET_HOURS,
      ),
    ).rejects.toThrow();

    expect(
      await prisma.order.count({ where: { accountId: account.id } }),
    ).toBe(0);
  });

  it("rejects a sell that exceeds owned shares (no short selling)", async () => {
    const { account } = await createTestUser();
    const security = await prisma.security.findUniqueOrThrow({
      where: { symbol: "AMZN" },
    });
    await setQuote(security.id, "100.00");

    await expect(
      createOrder(
        {
          accountId: account.id,
          securityId: security.id,
          side: "sell",
          orderType: "market",
          timeInForce: "day",
          quantity: "1",
          lotSelectionMethod: "fifo",
        },
        DURING_MARKET_HOURS,
      ),
    ).rejects.toThrow();
  });

  it("queues a market order placed while the market is closed instead of rejecting it, then fills it at the next market-hours evaluation", async () => {
    const { account } = await createTestUser();
    const security = await prisma.security.findUniqueOrThrow({
      where: { symbol: "AAPL" },
    });
    await setQuote(security.id, "100.00");

    const order = await createOrder(
      {
        accountId: account.id,
        securityId: security.id,
        side: "buy",
        orderType: "market",
        timeInForce: "day",
        quantity: "1",
      },
      OUTSIDE_MARKET_HOURS,
    );
    expect(order.status).toBe("pending");
    // A "day" order placed after-hours should stay alive through the next
    // session's close, not expire before the market it's waiting for even
    // opens.
    expect(order.expiresAt!.getTime()).toBeGreaterThan(
      OUTSIDE_MARKET_HOURS.getTime(),
    );

    await evaluateOrders(OUTSIDE_MARKET_HOURS);
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
        .status,
    ).toBe("pending");

    await evaluateOrders(DURING_MARKET_HOURS);
    const filled = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(filled.status).toBe("filled");
  });

  it("still accepts a limit order while the market is closed, but leaves it pending until a market-hours evaluation", async () => {
    const { account } = await createTestUser();
    const security = await prisma.security.findUniqueOrThrow({
      where: { symbol: "MSFT" },
    });
    await setQuote(security.id, "100.00");

    const order = await createOrder(
      {
        accountId: account.id,
        securityId: security.id,
        side: "buy",
        orderType: "limit",
        timeInForce: "gtc",
        quantity: "1",
        limitPrice: "100",
      },
      OUTSIDE_MARKET_HOURS,
    );
    expect(order.status).toBe("pending");

    // Condition is already met, but the market's closed - the evaluator
    // should leave it pending rather than filling against a stale price.
    await evaluateOrders(OUTSIDE_MARKET_HOURS);
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
        .status,
    ).toBe("pending");

    // Once the market's open, the same still-matching order fills.
    await evaluateOrders(DURING_MARKET_HOURS);
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
        .status,
    ).toBe("filled");
  });
});
