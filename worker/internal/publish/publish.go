// Package publish sends quote ticks to Redis pub/sub for the app's SSE
// endpoint to relay to browser clients.
package publish

import (
	"context"
	"encoding/json"

	"github.com/redis/go-redis/v9"
)

// QuoteChannel must match the channel name lib/quotes/quoteEvents.ts
// subscribes to on the app side.
const QuoteChannel = "quotes"

// Payload mirrors QuoteTickPayload in lib/quotes/quoteEvents.ts exactly,
// so the app-side Redis subscriber needs no parsing changes.
type Payload struct {
	Symbol string `json:"symbol"`
	Price  string `json:"price"`
	AsOf   string `json:"asOf"`
}

func PublishQuoteTick(ctx context.Context, client *redis.Client, payload Payload) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return client.Publish(ctx, QuoteChannel, data).Err()
}
