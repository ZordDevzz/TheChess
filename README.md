# TheChess

A self-hosted web chess platform with engine analysis, AI sparring, and real-time multiplayer.

---

## Overview

TheChess is a full-stack web application designed for playing, analyzing, and self-hosting chess games locally or on private networks.

### Features
* **Play vs AI**: Stockfish engine with adjustable strength and Maia-style persona levels (1100–1900).
* **Game Analysis**: MultiPV evaluation, win/draw/loss (WDL) metrics, and move classifications (Best, Excellent, Inaccuracy, Mistake, Blunder).
* **Real-time Multiplayer**: In-browser play with Fischer clocks, draw/resign/takeback requests, lobby chat, and spectator mode.
* **Lab & Tournaments**: Automated engine-vs-engine matches and round-robin tournament simulation.
* **Board Tools**: Board editor with FEN validation, PGN import/export, and multiple sound themes.

---

## Architecture

* **Backend**: FastAPI (Python 3.12), `python-chess` for UCI engine interaction, SQLite with WAL mode, WebSockets for realtime events.
* **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, `chess.js`, and `react-chessboard`.
* **Engines**: Stockfish 17, Polyglot opening books, and optional Leela Chess Zero (Lc0) inference for Maia weights.

---

## Note on Chess Engines (Stockfish & Lc0)

* **Stockfish**: Can be downloaded automatically via `python engines/setup_engines.py` (Linux x86-64 AVX2).
* **Maia Weights**: Pre-trained Maia neural network weights (`maia-1100` to `maia-1900`) are also downloaded by `engines/setup_engines.py`.
* **Lc0 Binary**: Upstream Lc0 does not publish official Linux release binaries. If you build `lc0` from source and place it in `engines/lc0` (or your system PATH), the backend will use native neural net inference. **If `lc0` is not present, the backend automatically falls back to Stockfish-based policy sampling** so the app remains fully functional without compilation.

---

## Getting Started

### Option 1: Docker Compose (Recommended)

1. Clone the repository:
   ```bash
   git clone https://github.com/ZordDevzz/TheChess.git
   cd TheChess
   ```

2. Generate a session key and start the container:
   ```bash
   export THECHESS_SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
   docker compose up -d --build
   ```

3. Open `http://localhost:8000` in your browser.
   * Health check endpoint: `curl -fsS http://localhost:8000/health`
   * Persistent data is saved in the `thechess_data` Docker volume.

> Pass `--build-arg SKIP_ENGINES=1` if you want a fast build without downloading engine binaries.

---

### Option 2: Local Development

#### 1. Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

#### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```
The development server will run at `http://localhost:5173`.

#### 3. Engine Setup (Optional)
```bash
# Downloads Stockfish 17 and Maia weight files
python engines/setup_engines.py

# Compiles opening book
python engines/build_opening_book.py

# Downloads board sounds
python scripts/download_sounds.py
```

---

## Configuration

Configuration values can be provided through environment variables or a `.env` file (see [.env.example](.env.example)):

| Variable | Default | Description |
| :--- | :--- | :--- |
| `THECHESS_ENV` | `development` | Environment mode (`development` or `production`) |
| `THECHESS_SECRET_KEY` | *(auto-generated)* | Secret key for session authentication tokens |
| `THECHESS_DB_PATH` | `backend/data/thechess.db` | SQLite database file location |
| `THECHESS_ADMIN_USER` | `admin` | Default admin username on initial bootstrap |
| `THECHESS_ADMIN_PASSWORD` | *(random)* | Admin password (printed to console if empty) |
| `THECHESS_ALLOWED_ORIGINS` | `http://localhost:8000` | Allowed CORS origins (comma-separated) |
| `THECHESS_ENGINE_POOL` | `3` | Maximum concurrent Stockfish worker instances |
| `THECHESS_MAX_LC0_PER_ELO` | `2` | Maximum concurrent Lc0 workers per Elo rating |
| `THECHESS_MAX_TOTAL_LC0` | `6` | Maximum total Lc0 workers across all ratings |
| `THECHESS_LC0_IDLE_TIMEOUT`| `900` | Idle timeout in seconds before releasing Lc0 processes |

---

## Testing

Both backend and frontend have automated test suites:

```bash
# Backend tests (pytest)
cd backend
pytest tests -v

# Frontend tests & production build check
cd frontend
npm test
npm run build
```

---

## Directory Structure

```
TheChess/
├── backend/               # FastAPI application, engine management, SQLite layer
│   ├── analyzer.py        # Move classification & evaluation
│   ├── engine_manager.py  # UCI Stockfish & Lc0 process pool
│   ├── lab_manager.py     # Round-robin tournament & bot match runner
│   ├── main.py            # API routes and WebSocket handlers
│   └── tests/             # Pytest test suite
├── frontend/              # React 18 + Vite SPA
│   ├── src/               # UI components, pages, hooks, state
│   └── public/            # Static assets and sounds
├── engines/               # Engine download & opening book build scripts
├── scripts/               # Helper utilities
├── docker-compose.yml     # Container setup
├── Dockerfile             # Multi-stage production container build
└── LICENSE                # MIT License
```

---

## Contributing & License

Contributions, bug reports, and suggestions are welcome. Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

This project is licensed under the [MIT License](LICENSE).
