#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Khởi động TheChess Studio tại http://localhost:8000 ==="
cd "$ROOT_DIR/backend"
exec "$ROOT_DIR/backend/.venv/bin/uvicorn" main:app --host 0.0.0.0 --port 8000
