/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: {
          bg: 'var(--color-bg)',
          card: 'var(--color-card)',
          border: 'var(--color-border)',
          hover: 'var(--color-hover)',
          text: 'var(--color-text)',
          muted: 'var(--color-muted)',
        },
        naver: {
          green: '#03c75a',
          light: '#00de5a',
        }
      }
    },
  },
  plugins: [],
}
