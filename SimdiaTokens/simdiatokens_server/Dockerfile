# SimdiaTokens Backend — Single-stage build
# No caching tricks. Just builds the binary directly.

FROM rust:1.85-slim-bookworm

WORKDIR /app

# Install build + runtime deps
RUN apt-get update && apt-get install -y pkg-config libssl-dev ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*

# Copy everything
COPY . .

# Build
RUN cargo build --release

# The binary
ENV PORT=8080
EXPOSE 8080

CMD ["./target/release/simdiatokens_server"]
