/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./app/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: '#08080F',
        surface: '#111111',
        'surface-2': '#161616',
        'border-setl8': '#222222',
        primary: '#7C3AED',
        success: '#22C55E',
        danger: '#EF4444',
        warning: '#F59E0B',
        'text-primary': '#FFFFFF',
        'text-secondary': '#888888',
        'text-muted': '#555555',
        'buy': '#1565C0',
        'sell': '#B71C1C',
      },
    },
  },
  plugins: [],
};
