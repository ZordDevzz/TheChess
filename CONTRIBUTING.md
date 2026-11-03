# Contributing to TheChess

Thank you for your interest in contributing to TheChess.

## Reporting Issues

* Check existing [Issues](https://github.com/ZordDevzz/TheChess/issues) before opening a new one to avoid duplicates.
* Provide reproducible steps, expected behavior, and relevant logs or FEN/PGN strings when reporting bugs.

## Development Setup

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/ZordDevzz/TheChess.git
   cd TheChess
   ```
2. Set up the Python virtual environment:
   ```bash
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt -r requirements-dev.txt
   cd ..
   ```
3. Install frontend dependencies:
   ```bash
   cd frontend
   npm install
   cd ..
   ```

## Running Tests

Before submitting a Pull Request, ensure that all automated tests pass:

```bash
# Backend tests
cd backend && pytest tests -v && cd ..

# Frontend tests & TypeScript check
cd frontend && npm test && npm run build && cd ..
```

## Pull Request Guidelines

1. Create a descriptive feature branch from `master` (`git checkout -b feature/my-feature`).
2. Write concise commit messages following standard conventions (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`).
3. Open a Pull Request against `master` with a clear description of your changes.
