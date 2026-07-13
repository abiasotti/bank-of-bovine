// Command worker runs the two background jobs the spec calls for: polling
// quotes for watched/held securities, and triggering order evaluation.
//
// Order evaluation logic itself deliberately stays in TypeScript
// (lib/orders/orderEvaluator.ts) - it's already built, tested, and correct
// there. Reimplementing FIFO/LIFO/specific-lot selection, cost basis, and
// ledger posting in Go would mean two independent copies of money-critical
// logic that must stay behaviorally identical forever, for no real
// benefit. So this worker's "order evaluation job" is just a timer that
// POSTs to the app's internal route - see
// app/api/internal/evaluate-orders/route.ts.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
	"github.com/shopspring/decimal"

	"bank-of-bovine-worker/internal/db"
	"bank-of-bovine-worker/internal/publish"
	"bank-of-bovine-worker/internal/quotes"
)

type config struct {
	databaseURL       string
	redisURL          string
	quoteProvider     string
	finnhubAPIKey     string
	quotePollInterval time.Duration
	orderEvalInterval time.Duration
	appInternalURL    string
	internalAPISecret string
}

func loadConfig() (config, error) {
	cfg := config{
		databaseURL:       os.Getenv("DATABASE_URL"),
		redisURL:          getEnvDefault("REDIS_URL", "redis://localhost:6379"),
		quoteProvider:     getEnvDefault("QUOTE_PROVIDER", "mock"),
		finnhubAPIKey:     os.Getenv("FINNHUB_API_KEY"),
		appInternalURL:    getEnvDefault("APP_INTERNAL_URL", "http://localhost:3000"),
		internalAPISecret: os.Getenv("INTERNAL_API_SECRET"),
	}

	if cfg.databaseURL == "" {
		return cfg, errors.New("DATABASE_URL is required")
	}
	if cfg.internalAPISecret == "" {
		return cfg, errors.New("INTERNAL_API_SECRET is required")
	}
	if cfg.quoteProvider == "finnhub" && cfg.finnhubAPIKey == "" {
		return cfg, errors.New("QUOTE_PROVIDER=finnhub requires FINNHUB_API_KEY")
	}

	quotePollMs := getEnvIntDefault("QUOTE_POLL_INTERVAL_MS", quotePollDefaultMs(cfg.quoteProvider))
	cfg.quotePollInterval = time.Duration(quotePollMs) * time.Millisecond

	orderEvalMs := getEnvIntDefault("ORDER_EVAL_INTERVAL_MS", 7000)
	cfg.orderEvalInterval = time.Duration(orderEvalMs) * time.Millisecond

	return cfg, nil
}

// Finnhub's free tier is rate-limited to 60 req/min with no batch quote
// endpoint - 30s keeps a reasonable margin under that at typical scale
// (confirmed live during FinnhubQuoteProvider.ts's development). The mock
// provider has no such constraint, so it ticks much faster for a livelier
// local-dev feel.
func quotePollDefaultMs(provider string) int {
	if provider == "finnhub" {
		return 30000
	}
	return 5000
}

func getEnvDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvIntDefault(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil {
			return parsed
		}
	}
	return fallback
}

func main() {
	// Best-effort: local dev convenience only. In Docker, env vars come
	// from docker-compose's `environment:` section instead, so a missing
	// .env file here is expected and not an error.
	_ = godotenv.Load()

	cfg, err := loadConfig()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := pgxpool.New(ctx, cfg.databaseURL)
	if err != nil {
		log.Fatalf("postgres connect: %v", err)
	}
	defer pool.Close()

	redisOpts, err := redis.ParseURL(cfg.redisURL)
	if err != nil {
		log.Fatalf("redis url: %v", err)
	}
	redisClient := redis.NewClient(redisOpts)
	defer redisClient.Close()

	provider, err := buildProvider(ctx, pool, cfg)
	if err != nil {
		log.Fatalf("provider setup: %v", err)
	}

	log.Printf(
		"worker starting: provider=%s quotePollInterval=%s orderEvalInterval=%s appInternalURL=%s",
		cfg.quoteProvider, cfg.quotePollInterval, cfg.orderEvalInterval, cfg.appInternalURL,
	)

	go runQuoteLoop(ctx, pool, redisClient, provider, cfg)
	go runOrderEvalLoop(ctx, cfg)

	<-ctx.Done()
	log.Println("shutting down")
}

func buildProvider(ctx context.Context, pool *pgxpool.Pool, cfg config) (quotes.Provider, error) {
	if cfg.quoteProvider == "finnhub" {
		return quotes.NewFinnhubProvider(cfg.finnhubAPIKey), nil
	}
	if cfg.quoteProvider != "mock" {
		return nil, errors.New("QUOTE_PROVIDER must be \"mock\" or \"finnhub\"")
	}

	securities, err := db.RelevantSecurities(ctx, pool)
	if err != nil {
		return nil, err
	}
	initialPrices := make(map[string]decimal.Decimal, len(securities))
	for _, s := range securities {
		price, ok, err := db.LatestPriceBySecurityID(ctx, pool, s.ID)
		if err != nil {
			return nil, err
		}
		if ok {
			initialPrices[s.Symbol] = price
		}
	}
	return quotes.NewMockProvider(initialPrices), nil
}

func runQuoteLoop(ctx context.Context, pool *pgxpool.Pool, redisClient *redis.Client, provider quotes.Provider, cfg config) {
	ticker := time.NewTicker(cfg.quotePollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			tickQuotes(ctx, pool, redisClient, provider, cfg.quoteProvider)
		}
	}
}

// tickQuotes is the Go port of tickQuotes() in lib/quotes/quoteService.ts:
// look up relevant securities, fetch fresh quotes, persist each, publish
// each to Redis for live SSE push.
func tickQuotes(ctx context.Context, pool *pgxpool.Pool, redisClient *redis.Client, provider quotes.Provider, source string) {
	securities, err := db.RelevantSecurities(ctx, pool)
	if err != nil {
		log.Printf("tickQuotes: relevant securities query failed: %v", err)
		return
	}
	if len(securities) == 0 {
		return
	}

	symbolToID := make(map[string]string, len(securities))
	symbols := make([]string, 0, len(securities))
	for _, s := range securities {
		symbolToID[s.Symbol] = s.ID
		symbols = append(symbols, s.Symbol)
	}

	fetched, err := provider.GetQuotes(symbols)
	if err != nil {
		log.Printf("tickQuotes: provider.GetQuotes failed: %v", err)
		return
	}

	for _, q := range fetched {
		securityID, ok := symbolToID[q.Symbol]
		if !ok {
			continue
		}
		if err := db.InsertQuote(ctx, pool, db.QuoteInsert{
			SecurityID:    securityID,
			Price:         q.Price,
			AsOf:          q.AsOf,
			Source:        source,
			DayHigh:       q.DayHigh,
			DayLow:        q.DayLow,
			DayOpen:       q.DayOpen,
			PreviousClose: q.PreviousClose,
		}); err != nil {
			log.Printf("tickQuotes: insert quote for %s failed: %v", q.Symbol, err)
			continue
		}

		if err := publish.PublishQuoteTick(ctx, redisClient, publish.Payload{
			Symbol: q.Symbol,
			Price:  q.Price.String(),
			AsOf:   q.AsOf.UTC().Format(time.RFC3339),
		}); err != nil {
			log.Printf("tickQuotes: publish for %s failed: %v", q.Symbol, err)
		}
	}

	log.Printf("tickQuotes: fetched %d/%d quotes", len(fetched), len(symbols))
}

func runOrderEvalLoop(ctx context.Context, cfg config) {
	ticker := time.NewTicker(cfg.orderEvalInterval)
	defer ticker.Stop()

	client := &http.Client{Timeout: 15 * time.Second}

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			triggerOrderEvaluation(ctx, client, cfg)
		}
	}
}

// triggerOrderEvaluation POSTs to app/api/internal/evaluate-orders, which
// runs the real evaluateOrders() logic in TypeScript. That function
// already guards against overlapping/retried calls via a per-order
// `FOR UPDATE SKIP LOCKED` (see lib/orders/orderEvaluator.ts), so no
// additional locking is needed on the worker side.
func triggerOrderEvaluation(ctx context.Context, client *http.Client, cfg config) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, cfg.appInternalURL+"/api/internal/evaluate-orders", nil)
	if err != nil {
		log.Printf("evaluateOrders: request build failed: %v", err)
		return
	}
	req.Header.Set("x-internal-secret", cfg.internalAPISecret)

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("evaluateOrders: request failed: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("evaluateOrders: unexpected status %d", resp.StatusCode)
	}
}
