# Multi-stage build: compile a static binary, then run it in a minimal
# image. ca-certificates is needed at runtime for HTTPS calls to Finnhub.

FROM golang:1.26-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /worker .

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=builder /worker /usr/local/bin/worker
CMD ["worker"]
