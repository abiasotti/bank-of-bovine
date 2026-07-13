// Package db holds hand-written SQL for the worker - no ORM, mirroring the
// exact table/column shapes Prisma generated (quoted camelCase
// identifiers), confirmed against prisma/migrations/*/migration.sql.
package db

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"
)

type Security struct {
	ID     string
	Symbol string
}

// RelevantSecurities returns every security someone actively watches or
// holds an open position in - the Go port of getRelevantSecurities() in
// lib/quotes/quoteService.ts. Now that the securities catalog is open to
// the full market (not a small fixed seed list), polling everything would
// blow through Finnhub's free-tier rate limit, so only symbols someone
// actually cares about get a live background tick.
func RelevantSecurities(ctx context.Context, pool *pgxpool.Pool) ([]Security, error) {
	const query = `
		SELECT DISTINCT s.id, s.symbol
		FROM securities s
		WHERE s."isActive" = true
		AND (
			EXISTS (SELECT 1 FROM watchlist_items wi WHERE wi."securityId" = s.id)
			OR EXISTS (
				SELECT 1 FROM tax_lots tl
				WHERE tl."securityId" = s.id AND tl."openQuantity" > 0
			)
		)
	`
	rows, err := pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var securities []Security
	for rows.Next() {
		var s Security
		if err := rows.Scan(&s.ID, &s.Symbol); err != nil {
			return nil, err
		}
		securities = append(securities, s)
	}
	return securities, rows.Err()
}

type QuoteInsert struct {
	SecurityID    string
	Price         decimal.Decimal
	AsOf          time.Time
	Source        string
	DayHigh       *decimal.Decimal
	DayLow        *decimal.Decimal
	DayOpen       *decimal.Decimal
	PreviousClose *decimal.Decimal
}

func decimalPtrText(d *decimal.Decimal) *string {
	if d == nil {
		return nil
	}
	s := d.String()
	return &s
}

// InsertQuote mirrors the quotes table shape from
// prisma/migrations/20260713014825_init and
// prisma/migrations/20260713165613_add_quote_ohlc_fields. Decimal values
// are passed as text and cast by Postgres (::numeric), avoiding a
// pgx<->shopspring numeric type-registration dependency for this one
// write path. The id is generated here (uuid.NewString()) rather than via
// gen_random_uuid() since the app deliberately doesn't enable the pgcrypto
// extension - see prisma/schema.prisma's @default(uuid()) convention,
// which generates IDs in application code, not the database.
func InsertQuote(ctx context.Context, pool *pgxpool.Pool, q QuoteInsert) error {
	const query = `
		INSERT INTO quotes (id, "securityId", price, "asOf", source, "dayHigh", "dayLow", "dayOpen", "previousClose", "createdAt")
		VALUES ($1, $2, $3::numeric, $4, $5, $6::numeric, $7::numeric, $8::numeric, $9::numeric, now())
	`
	_, err := pool.Exec(ctx, query,
		uuid.NewString(),
		q.SecurityID,
		q.Price.String(),
		q.AsOf,
		q.Source,
		decimalPtrText(q.DayHigh),
		decimalPtrText(q.DayLow),
		decimalPtrText(q.DayOpen),
		decimalPtrText(q.PreviousClose),
	)
	return err
}

// LatestPriceBySecurityID seeds the mock provider's initial in-memory
// state from whatever's already in Postgres, mirroring getProvider()'s
// initialPrices lookup in quoteService.ts (so mock prices don't reset to
// the $100 default on every worker restart).
func LatestPriceBySecurityID(ctx context.Context, pool *pgxpool.Pool, securityID string) (decimal.Decimal, bool, error) {
	const query = `SELECT price::text FROM quotes WHERE "securityId" = $1 ORDER BY "asOf" DESC LIMIT 1`
	var priceText string
	err := pool.QueryRow(ctx, query, securityID).Scan(&priceText)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return decimal.Zero, false, nil
		}
		return decimal.Zero, false, err
	}
	price, err := decimal.NewFromString(priceText)
	if err != nil {
		return decimal.Zero, false, err
	}
	return price, true, nil
}
