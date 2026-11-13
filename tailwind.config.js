/** @type {import('tailwindcss').Config} */
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const branding = require('./branding.config.json')

// Color slot names (navy/gold/blue/slate) stay fixed so no component ever
// changes — only the hex values swap per client via branding.config.json.
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      boxShadow: {
        luxury: '0 20px 60px -15px rgba(0,0,0,0.35)',
      },
      fontFamily: {
        display: ['Fraunces', 'serif'],
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        navy: branding.colors.navy,
        gold: branding.colors.gold,
        blue: branding.colors.blue,
        slate: branding.colors.slate,
      },
    },
  },
  plugins: [],
}
