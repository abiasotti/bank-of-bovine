package quotes

import (
	"time"

	"github.com/shopspring/decimal"
)

// Quote mirrors lib/quotes/QuoteProvider.ts's Quote interface.
type Quote struct {
	Symbol        string
	Price         decimal.Decimal
	AsOf          time.Time
	DayHigh       *decimal.Decimal
	DayLow        *decimal.Decimal
	DayOpen       *decimal.Decimal
	PreviousClose *decimal.Decimal
}

// Provider mirrors lib/quotes/QuoteProvider.ts's QuoteProvider interface.
// GetHistoricalQuotes is intentionally omitted: the worker only ever needs
// the latest tick - history is read from Postgres by the app, not
// regenerated from the provider (same as the TS providers).
type Provider interface {
	GetQuote(symbol string) (Quote, error)
	GetQuotes(symbols []string) ([]Quote, error)
}
