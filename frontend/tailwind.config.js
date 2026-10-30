/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        base: 'var(--c-base)',
        panel: 'var(--c-panel)',
        card: 'var(--c-card)',
        inset: 'var(--c-inset)',
        overlay: 'var(--c-overlay)',
        line: 'var(--c-line)',
        'line-strong': 'var(--c-line-strong)',
        ink: 'var(--c-ink)',
        'ink-2': 'var(--c-ink-2)',
        'ink-3': 'var(--c-ink-3)',
        accent: 'var(--c-accent)',
        'accent-ink': 'var(--c-accent-ink)',
        danger: 'var(--c-danger)',
        'sq-w': 'var(--c-sq-w)',
        'sq-b': 'var(--c-sq-b)',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'Times New Roman', 'serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
}
