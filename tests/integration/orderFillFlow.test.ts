import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import { createTransfer } from "@/lib/ledger/transferService";
import { getAccountBalance } from "@/lib/ledger/getAccountBalance";
import { createOrder, cancelOrder } from "@/lib/orders/orderService";
import { evaluateOrders } from "@/lib/orders/orderEvaluator";
import { createTestUser, truncateTestData } from "./testHelpers";

async function setQuote(securityId: string, price: string) {
  return prisma.quote.create({
    data: { securityId, price, asOf: new Date(), source: "mock" },
  });
}

describe("order fill flow (integration)", () => {
  afterEach(async () => {
    await truncateTestData();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("funds an account, fills a market buy into a tax lot, then a crossing GTC limit sell consumes lots FIFO with correct realized gain/loss and a consistent ledger balance", async () => {
    const { account, externalBankAccount } = await createTestUser();
    const security = await prisma.security.findUniqueOrThrow({
      where: { symbol: "AAPL" },
    });

    await createTransfer({
      accountId: account.id,
      externalBankAccountId: externalBankAccount.id,
      amount: "100000",
    });

    await setQuote(security.id, "100.00");
    const buy1 = await createOrder({
      accountId: account.id,
      securityId: security.id,
      side: "buy",
      orderType: "market",
      timeInForce: "day",
      quantity: "10",
    });
    expect(buy1.status).toBe("filled");
    expect((await getAccountBalance(account.id)).toString()).toBe("99000");

    await setQuote(security.id, "120.00");
    await createOrder({
      accountId: account.id,
      securityId: security.id,
      side: "buy",
      orderType: "market",
      timeInForce: "day",
      quantity: "5",
    });

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

    await evaluateOrders();

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

    // 99000 (after buy1) - 600 (buy2: 5*120) + 1440 (sell proceeds: 12*120)
    expect((await getAccountBalance(account.id)).toString()).toBe("99840");
  });

  it("never fills a cancelled order even if a later price crosses its limit", async () => {
    const { account, externalBankAccount } = await createTestUser();
    const security = await prisma.security.findUniqueOrThrow({
      where: { symbol: "MSFT" },
    });
    await createTransfer({
      accountId: account.id,
      externalBankAccountId: externalBankAccount.id,
      amount: "10000",
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
    const { account, externalBankAccount } = await createTestUser();
    const security = await prisma.security.findUniqueOrThrow({
      where: { symbol: "TSLA" },
    });
    await createTransfer({
      accountId: account.id,
      externalBankAccountId: externalBankAccount.id,
      amount: "10000",
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
    const { account, externalBankAccount } = await createTestUser();
    const security = await prisma.security.findUniqueOrThrow({
      where: { symbol: "GOOGL" },
    });
    await createTransfer({
      accountId: account.id,
      externalBankAccountId: externalBankAccount.id,
      amount: "100",
    });
    await setQuote(security.id, "500.00");

    await expect(
      createOrder({
        accountId: account.id,
        securityId: security.id,
        side: "buy",
        orderType: "market",
        timeInForce: "day",
        quantity: "1",
      }),
    ).rejects.toThrow();

    expect(
      await prisma.order.count({ where: { accountId: account.id } }),
    ).toBe(0);
  });

  it("rejects a sell that exceeds owned shares (no short selling)", async () => {
    const { account, externalBankAccount } = await createTestUser();
    const security = await prisma.security.findUniqueOrThrow({
      where: { symbol: "AMZN" },
    });
    await createTransfer({
      accountId: account.id,
      externalBankAccountId: externalBankAccount.id,
      amount: "10000",
    });
    await setQuote(security.id, "100.00");

    await expect(
      createOrder({
        accountId: account.id,
        securityId: security.id,
        side: "sell",
        orderType: "market",
        timeInForce: "day",
        quantity: "1",
        lotSelectionMethod: "fifo",
      }),
    ).rejects.toThrow();
  });
});
