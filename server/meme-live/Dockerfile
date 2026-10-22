# Built from the repo root: flyctl deploy -c server/meme-live/fly.toml --dockerfile server/meme-live/Dockerfile
FROM node:22-slim
WORKDIR /app
COPY shared/meme.ts shared/meme.ts
COPY shared/solana.ts shared/solana.ts
COPY scripts/meme-core.ts scripts/meme-core.ts
COPY server/meme-live/server.ts server/meme-live/server.ts
ENV STATE_DIR=/data PORT=8080 NODE_NO_WARNINGS=1
CMD ["node", "--experimental-strip-types", "server/meme-live/server.ts"]
