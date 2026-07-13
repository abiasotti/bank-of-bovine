package quotes

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"github.com/shopspring/decimal"
)

const finnhubBaseURL = "https://finnhub.io/api/v1"

type finnhubQuoteResponse struct {
	C  float64 `json:"c"`
	D  float64 `json:"d"`
	DP float64 `json:"dp"`
	H  float64 `json:"h"`
	L  float64 `json:"l"`
	O  float64 `json:"o"`
	PC float64 `json:"pc"`
	T  int64   `json:"t"`
}

// UnknownSymbolError mirrors UnknownSymbolError in
// lib/quotes/QuoteProvider.ts - Finnhub returns an all-zero payload
// (c=0, t=0) for a ticker it doesn't recognize, confirmed live during the
// TS provider's development.
type UnknownSymbolError struct {
	Symbol string
}

func (e *UnknownSymbolError) Error() string {
	return fmt.Sprintf("unknown symbol: %s", e.Symbol)
}

// FinnhubProvider is the Go port of lib/quotes/FinnhubQuoteProvider.ts -
// same endpoint, same response shape ({c,d,dp,h,l,o,pc,t}), confirmed live
// against the real API during that provider's development.
type FinnhubProvider struct {
	apiKey     string
	httpClient *http.Client
}

func NewFinnhubProvider(apiKey string) *FinnhubProvider {
	return &FinnhubProvider{
		apiKey:     apiKey,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

func (p *FinnhubProvider) GetQuote(symbol string) (Quote, error) {
	reqURL := fmt.Sprintf("%s/quote?symbol=%s&token=%s", finnhubBaseURL, url.QueryEscape(symbol), p.apiKey)
	resp, err := p.httpClient.Get(reqURL)
	if err != nil {
		return Quote{}, fmt.Errorf("finnhub request for %s: %w", symbol, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return Quote{}, fmt.Errorf("finnhub request for %s failed with status %d", symbol, resp.StatusCode)
	}

	var data finnhubQuoteResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return Quote{}, fmt.Errorf("finnhub response for %s: %w", symbol, err)
	}

	if data.C == 0 && data.T == 0 {
		return Quote{}, &UnknownSymbolError{Symbol: symbol}
	}

	dayHigh := decimal.NewFromFloat(data.H).Round(4)
	dayLow := decimal.NewFromFloat(data.L).Round(4)
	dayOpen := decimal.NewFromFloat(data.O).Round(4)
	previousClose := decimal.NewFromFloat(data.PC).Round(4)

	return Quote{
		Symbol:        symbol,
		Price:         decimal.NewFromFloat(data.C).Round(4),
		AsOf:          time.Unix(data.T, 0),
		DayHigh:       &dayHigh,
		DayLow:        &dayLow,
		DayOpen:       &dayOpen,
		PreviousClose: &previousClose,
	}, nil
}

// GetQuotes fetches symbols sequentially (not concurrently) to avoid
// bursting requests against Finnhub's 60 req/min free-tier limit, mirroring
// FinnhubQuoteProvider.ts's getQuotes(). A single symbol's failure is
// skipped rather than aborting the whole batch - the caller logs it.
func (p *FinnhubProvider) GetQuotes(symbols []string) ([]Quote, error) {
	quotes := make([]Quote, 0, len(symbols))
	for _, symbol := range symbols {
		quote, err := p.GetQuote(symbol)
		if err != nil {
			continue
		}
		quotes = append(quotes, quote)
	}
	return quotes, nil
}
