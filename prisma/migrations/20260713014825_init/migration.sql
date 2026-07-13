-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "accountType" TEXT NOT NULL DEFAULT 'brokerage',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_bank_accounts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "entryType" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "transferId" UUID,
    "executionId" UUID,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfers" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "externalBankAccountId" UUID NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'deposit',
    "amount" DECIMAL(18,4) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "securities" (
    "id" UUID NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "exchange" TEXT NOT NULL DEFAULT 'MOCK',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "securities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" UUID NOT NULL,
    "securityId" UUID NOT NULL,
    "price" DECIMAL(18,4) NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'mock',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "securityId" UUID NOT NULL,
    "side" TEXT NOT NULL,
    "orderType" TEXT NOT NULL,
    "timeInForce" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "limitPrice" DECIMAL(18,4),
    "stopPrice" DECIMAL(18,4),
    "lotSelectionMethod" TEXT,
    "specificLotIds" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'pending',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "filledAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_lots" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "securityId" UUID NOT NULL,
    "executionId" UUID NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "openQuantity" DECIMAL(18,6) NOT NULL,
    "costBasisPerShare" DECIMAL(18,4) NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "executions" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "securityId" UUID NOT NULL,
    "side" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "price" DECIMAL(18,4) NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "realizedGainLoss" DECIMAL(18,4),

    CONSTRAINT "executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lot_consumptions" (
    "id" UUID NOT NULL,
    "executionId" UUID NOT NULL,
    "taxLotId" UUID NOT NULL,
    "quantityConsumed" DECIMAL(18,6) NOT NULL,
    "costBasisPerShare" DECIMAL(18,4) NOT NULL,
    "realizedGainLoss" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "lot_consumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watchlists" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watchlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watchlist_items" (
    "id" UUID NOT NULL,
    "watchlistId" UUID NOT NULL,
    "securityId" UUID NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watchlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_userId_key" ON "accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "external_bank_accounts_userId_key" ON "external_bank_accounts"("userId");

-- CreateIndex
CREATE INDEX "ledger_entries_accountId_occurredAt_idx" ON "ledger_entries"("accountId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "securities_symbol_key" ON "securities"("symbol");

-- CreateIndex
CREATE INDEX "quotes_securityId_asOf_idx" ON "quotes"("securityId", "asOf" DESC);

-- CreateIndex
CREATE INDEX "orders_status_securityId_idx" ON "orders"("status", "securityId");

-- CreateIndex
CREATE INDEX "orders_accountId_submittedAt_idx" ON "orders"("accountId", "submittedAt" DESC);

-- CreateIndex
CREATE INDEX "tax_lots_accountId_securityId_acquiredAt_idx" ON "tax_lots"("accountId", "securityId", "acquiredAt");

-- CreateIndex
CREATE INDEX "executions_accountId_securityId_executedAt_idx" ON "executions"("accountId", "securityId", "executedAt");

-- CreateIndex
CREATE UNIQUE INDEX "lot_consumptions_executionId_taxLotId_key" ON "lot_consumptions"("executionId", "taxLotId");

-- CreateIndex
CREATE UNIQUE INDEX "watchlists_accountId_key" ON "watchlists"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "watchlist_items_watchlistId_securityId_key" ON "watchlist_items"("watchlistId", "securityId");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_bank_accounts" ADD CONSTRAINT "external_bank_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_externalBankAccountId_fkey" FOREIGN KEY ("externalBankAccountId") REFERENCES "external_bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "securities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "securities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_lots" ADD CONSTRAINT "tax_lots_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_lots" ADD CONSTRAINT "tax_lots_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "securities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_lots" ADD CONSTRAINT "tax_lots_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executions" ADD CONSTRAINT "executions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executions" ADD CONSTRAINT "executions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executions" ADD CONSTRAINT "executions_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "securities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_consumptions" ADD CONSTRAINT "lot_consumptions_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_consumptions" ADD CONSTRAINT "lot_consumptions_taxLotId_fkey" FOREIGN KEY ("taxLotId") REFERENCES "tax_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_watchlistId_fkey" FOREIGN KEY ("watchlistId") REFERENCES "watchlists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "securities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint: ledger_entries
-- Prisma's schema language has no declarative CHECK-constraint attribute,
-- so these invariants are added by hand in this migration.
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_amount_nonzero" CHECK ("amount" <> 0);
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_exactly_one_reference" CHECK (
    ("transferId" IS NOT NULL AND "executionId" IS NULL) OR
    ("transferId" IS NULL AND "executionId" IS NOT NULL)
);

-- CheckConstraint: transfers
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_amount_positive" CHECK ("amount" > 0);

-- CheckConstraint: quotes
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_price_positive" CHECK ("price" > 0);

-- CheckConstraint: orders
ALTER TABLE "orders" ADD CONSTRAINT "orders_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_limit_price_required" CHECK ("orderType" <> 'limit' OR "limitPrice" IS NOT NULL);
ALTER TABLE "orders" ADD CONSTRAINT "orders_stop_price_required" CHECK ("orderType" <> 'stop' OR "stopPrice" IS NOT NULL);

-- CheckConstraint: tax_lots
ALTER TABLE "tax_lots" ADD CONSTRAINT "tax_lots_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "tax_lots" ADD CONSTRAINT "tax_lots_open_quantity_nonnegative" CHECK ("openQuantity" >= 0);
ALTER TABLE "tax_lots" ADD CONSTRAINT "tax_lots_open_quantity_le_quantity" CHECK ("openQuantity" <= "quantity");
ALTER TABLE "tax_lots" ADD CONSTRAINT "tax_lots_cost_basis_positive" CHECK ("costBasisPerShare" > 0);

-- CheckConstraint: executions
ALTER TABLE "executions" ADD CONSTRAINT "executions_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "executions" ADD CONSTRAINT "executions_price_positive" CHECK ("price" > 0);

-- CheckConstraint: lot_consumptions
ALTER TABLE "lot_consumptions" ADD CONSTRAINT "lot_consumptions_quantity_positive" CHECK ("quantityConsumed" > 0);
