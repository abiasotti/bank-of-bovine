import { prisma } from "@/lib/db/client";

const SEED_SECURITIES: Array<{
  symbol: string;
  name: string;
  startingPrice: string;
}> = [
  { symbol: "AAPL", name: "Apple Inc.", startingPrice: "225.50" },
  { symbol: "MSFT", name: "Microsoft Corporation", startingPrice: "430.20" },
  { symbol: "GOOGL", name: "Alphabet Inc. Class A", startingPrice: "175.80" },
  { symbol: "AMZN", name: "Amazon.com Inc.", startingPrice: "195.40" },
  { symbol: "TSLA", name: "Tesla Inc.", startingPrice: "260.10" },
  { symbol: "NVDA", name: "NVIDIA Corporation", startingPrice: "140.75" },
  { symbol: "META", name: "Meta Platforms Inc.", startingPrice: "590.30" },
  { symbol: "NFLX", name: "Netflix Inc.", startingPrice: "720.60" },
  { symbol: "DIS", name: "The Walt Disney Company", startingPrice: "112.40" },
  { symbol: "JPM", name: "JPMorgan Chase & Co.", startingPrice: "225.90" },
  { symbol: "V", name: "Visa Inc.", startingPrice: "310.15" },
  { symbol: "WMT", name: "Walmart Inc.", startingPrice: "88.20" },
  { symbol: "KO", name: "The Coca-Cola Company", startingPrice: "65.30" },
  { symbol: "PEP", name: "PepsiCo Inc.", startingPrice: "168.50" },
  { symbol: "XOM", name: "Exxon Mobil Corporation", startingPrice: "115.70" },
  { symbol: "JNJ", name: "Johnson & Johnson", startingPrice: "152.40" },
  { symbol: "PG", name: "The Procter & Gamble Company", startingPrice: "170.20" },
  { symbol: "HD", name: "The Home Depot Inc.", startingPrice: "395.60" },
  { symbol: "BA", name: "The Boeing Company", startingPrice: "180.90" },
  { symbol: "SPY", name: "SPDR S&P 500 ETF Trust", startingPrice: "580.00" },
];

async function main() {
  for (const security of SEED_SECURITIES) {
    const created = await prisma.security.upsert({
      where: { symbol: security.symbol },
      update: {},
      create: {
        symbol: security.symbol,
        name: security.name,
        exchange: "MOCK",
      },
    });

    const existingQuote = await prisma.quote.findFirst({
      where: { securityId: created.id },
    });

    if (!existingQuote) {
      await prisma.quote.create({
        data: {
          securityId: created.id,
          price: security.startingPrice,
          asOf: new Date(),
          source: "mock",
        },
      });
    }
  }

  console.log(`Seeded ${SEED_SECURITIES.length} securities.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
