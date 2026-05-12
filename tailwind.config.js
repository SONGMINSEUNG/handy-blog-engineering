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
        naver: {
          green: '#03c75a',
          light: '#00de5a',
        }
      }
    },
  },
  plugins: [],
}
