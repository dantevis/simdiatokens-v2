# SimdiaTokens Backend — Multi-stage build with dependency caching
# Build context: SimdiaTokens/simdiatokens_server/

# Stage 1: Base image with build deps
FROM rust:slim-bookworm AS chef
WORKDIR /app
RUN apt-get update && apt-get install -y pkg-config libssl-dev ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*

# Stage 2: Cache dependencies
FROM chef AS planner
COPY Cargo.toml Cargo.lock ./
RUN mkdir -p src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -rf src

# Stage 3: Build the real binary
FROM planner AS builder
COPY src ./src
RUN cargo build --release

# Stage 4: Minimal runtime image
FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y ca-certificates libssl3 sqlite3 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/simdiatokens_server /app/simdiatokens_server
ENV PORT=8080
EXPOSE 8080
CMD ["/app/simdiatokens_server"]
