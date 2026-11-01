FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/workspace-service ./cmd/workspace-service

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=build /out/workspace-service /usr/local/bin/workspace-service
ENTRYPOINT ["workspace-service"]
