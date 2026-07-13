package quotes

import (
	"testing"

	"github.com/shopspring/decimal"
)

func TestMockProviderReturnsSeededSymbol(t *testing.T) {
	p := NewMockProvider(map[string]decimal.Decimal{"AAPL": decimal.NewFromInt(100)})
	q, err := p.GetQuote("AAPL")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if q.Symbol != "AAPL" {
		t.Errorf("symbol = %s, want AAPL", q.Symbol)
	}
	if !q.Price.GreaterThan(decimal.Zero) {
		t.Errorf("price = %s, want > 0", q.Price)
	}
}

func TestMockProviderLazilySeedsUnseenSymbol(t *testing.T) {
	// The mock provider has no real market to validate against, so any
	// symbol is "valid" - matches RandomWalkQuoteProvider.ts's behavior.
	p := NewMockProvider(map[string]decimal.Decimal{})
	q, err := p.GetQuote("ZZZZ")
	if err != nil {
		t.Fatalf("unexpected error for unseen symbol: %v", err)
	}
	if !q.Price.GreaterThan(decimal.Zero) {
		t.Errorf("price = %s, want > 0", q.Price)
	}
}

func TestMockProviderNeverGoesNonPositive(t *testing.T) {
	p := &MockProvider{
		prices:       map[string]decimal.Decimal{"AAPL": decimal.NewFromInt(1)},
		volatility:   50, // extreme, to try to force a negative excursion
		defaultPrice: decimal.NewFromInt(100),
	}
	for i := 0; i < 500; i++ {
		q, err := p.GetQuote("AAPL")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !q.Price.GreaterThan(decimal.Zero) {
			t.Fatalf("price went non-positive: %s", q.Price)
		}
	}
}

func TestMockProviderGetQuotesReturnsOnePerSymbol(t *testing.T) {
	p := NewMockProvider(map[string]decimal.Decimal{
		"AAPL": decimal.NewFromInt(100),
		"MSFT": decimal.NewFromInt(200),
	})
	quotes, err := p.GetQuotes([]string{"AAPL", "MSFT"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(quotes) != 2 {
		t.Fatalf("got %d quotes, want 2", len(quotes))
	}
}
