/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        glow: '0 0 35px rgba(56, 189, 248, 0.35)'
      }
    }
  },
  plugins: []
};
