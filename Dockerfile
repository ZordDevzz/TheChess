# syntax=docker/dockerfile:1
# =============================================================================
# TheChess — Multi-stage Docker image (P2-3)
#   Stage 1: build frontend (Vite -> static dist)
#   Stage 2: runtime Python + FastAPI + engines (Stockfish/Maia)
# Image cuối chỉ chứa backend + frontend dist + engines, không có toolchain.
# =============================================================================

# ---------- Stage 1: Build frontend ----------
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---------- Stage 2: Runtime ----------
FROM python:3.12-slim AS runtime

# curl cho healthcheck; ca-certificates cho setup_engines.py tải GitHub releases
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates xz-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cài Python dependencies trước để tận dụng layer cache
COPY backend/requirements.txt backend/requirements-dev.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy source backend + frontend dist
COPY backend/ ./backend/
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Tải Stockfish 17 (ubuntu-x86-64-avx2) + weights Maia 1100-1900.
# Build arg SKIP_ENGINES=1 để build nhanh khi chỉ cần API (engine sẽ unavailable).
ARG SKIP_ENGINES=0
COPY engines/setup_engines.py ./engines/setup_engines.py
RUN if [ "$SKIP_ENGINES" != "1" ]; then python engines/setup_engines.py; fi

# CSDL SQLite + secret key file nằm ở volume /app/backend/data
RUN mkdir -p /app/backend/data
VOLUME ["/app/backend/data"]

ENV THECHESS_DB_PATH=/app/backend/data/thechess.db \
    THECHESS_SECRET_KEY_FILE=/app/backend/data/.secret_key \
    THECHESS_ENV=production

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

WORKDIR /app/backend
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
