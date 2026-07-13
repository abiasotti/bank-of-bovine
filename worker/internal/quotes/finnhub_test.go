package quotes

import (
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) {
	return f(r)
}

func newTestProvider(body string, status int) *FinnhubProvider {
	return &FinnhubProvider{
		apiKey: "test-key",
		httpClient: &http.Client{
			Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
				return &http.Response{
					StatusCode: status,
					Body:       io.NopCloser(strings.NewReader(body)),
				}, nil
			}),
		},
	}
}

// Response shape ({c,d,dp,h,l,o,pc,t}) confirmed live against the real API
// during FinnhubQuoteProvider.ts's development.
func TestFinnhubProviderParsesRealShapedResponse(t *testing.T) {
	p := newTestProvider(`{"c":317.06,"d":1.74,"dp":0.55,"h":323.45,"l":316.09,"o":316.5,"pc":315.32,"t":1783958311}`, 200)

	q, err := p.GetQuote("AAPL")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if q.Symbol != "AAPL" {
		t.Errorf("symbol = %s, want AAPL", q.Symbol)
	}
	if q.Price.String() != "317.06" {
		t.Errorf("price = %s, want 317.06", q.Price)
	}
	if q.PreviousClose == nil || q.PreviousClose.String() != "315.32" {
		t.Errorf("previousClose = %v, want 315.32", q.PreviousClose)
	}
}

// Confirmed live: an unknown/invalid ticker returns an all-zero payload
// with t=0.
func TestFinnhubProviderTreatsAllZeroAsUnknownSymbol(t *testing.T) {
	p := newTestProvider(`{"c":0,"d":null,"dp":null,"h":0,"l":0,"o":0,"pc":0,"t":0}`, 200)

	_, err := p.GetQuote("NOTAREALSYMBOL")
	var unknownErr *UnknownSymbolError
	if !errors.As(err, &unknownErr) {
		t.Fatalf("expected UnknownSymbolError, got %v", err)
	}
}

func TestFinnhubProviderErrorsOnNonOkStatus(t *testing.T) {
	p := newTestProvider(`{}`, 429)

	_, err := p.GetQuote("AAPL")
	if err == nil {
		t.Fatal("expected error for non-200 status")
	}
}

func TestFinnhubProviderGetQuotesSkipsFailingSymbol(t *testing.T) {
	calls := 0
	p := &FinnhubProvider{
		apiKey: "test-key",
		httpClient: &http.Client{
			Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
				calls++
				if strings.Contains(r.URL.String(), "BROKEN") {
					return &http.Response{StatusCode: 500, Body: io.NopCloser(strings.NewReader(`{}`))}, nil
				}
				return &http.Response{
					StatusCode: 200,
					Body:       io.NopCloser(strings.NewReader(`{"c":100,"d":1,"dp":1,"h":101,"l":99,"o":99,"pc":99,"t":1000}`)),
				}, nil
			}),
		},
	}

	quotes, err := p.GetQuotes([]string{"AAPL", "BROKEN", "MSFT"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(quotes) != 2 {
		t.Fatalf("got %d quotes, want 2 (BROKEN should be skipped)", len(quotes))
	}
	if calls != 3 {
		t.Fatalf("got %d calls, want 3 (one per symbol)", calls)
	}
}
