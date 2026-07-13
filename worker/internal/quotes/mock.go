package quotes

import (
	"math"
	"math/rand"
	"sync"
	"time"

	"github.com/shopspring/decimal"
)

const (
	defaultVolatility    = 0.005
	defaultStartingPrice = 100
)

var minPrice = decimal.NewFromFloat(0.01)

// MockProvider is a random-walk price generator - the Go port of
// lib/quotes/RandomWalkQuoteProvider.ts. Any symbol is "valid": there's no
// real market to validate against, so an unseen symbol is lazily seeded at
// defaultPrice on first use, matching the TS provider's behavior exactly.
type MockProvider struct {
	mu           sync.Mutex
	prices       map[string]decimal.Decimal
	volatility   float64
	defaultPrice decimal.Decimal
}

func NewMockProvider(initialPrices map[string]decimal.Decimal) *MockProvider {
	prices := make(map[string]decimal.Decimal, len(initialPrices))
	for symbol, price := range initialPrices {
		prices[symbol] = price
	}
	return &MockProvider{
		prices:       prices,
		volatility:   defaultVolatility,
		defaultPrice: decimal.NewFromInt(defaultStartingPrice),
	}
}

func (p *MockProvider) GetQuote(symbol string) (Quote, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	current, ok := p.prices[symbol]
	if !ok {
		current = p.defaultPrice
	}
	next := step(current, p.volatility)
	p.prices[symbol] = next

	return Quote{Symbol: symbol, Price: next, AsOf: time.Now()}, nil
}

func (p *MockProvider) GetQuotes(symbols []string) ([]Quote, error) {
	quotes := make([]Quote, 0, len(symbols))
	for _, symbol := range symbols {
		quote, err := p.GetQuote(symbol)
		if err != nil {
			return nil, err
		}
		quotes = append(quotes, quote)
	}
	return quotes, nil
}

func step(current decimal.Decimal, volatility float64) decimal.Decimal {
	pctChange := randomGaussian() * volatility
	next := current.Mul(decimal.NewFromFloat(1 + pctChange))
	if next.LessThan(minPrice) {
		next = minPrice
	}
	return next.Round(4)
}

// Box-Muller transform for a standard-normal random sample - same
// algorithm as randomGaussian() in RandomWalkQuoteProvider.ts.
func randomGaussian() float64 {
	var u, v float64
	for u == 0 {
		u = rand.Float64()
	}
	for v == 0 {
		v = rand.Float64()
	}
	return math.Sqrt(-2*math.Log(u)) * math.Cos(2*math.Pi*v)
}
