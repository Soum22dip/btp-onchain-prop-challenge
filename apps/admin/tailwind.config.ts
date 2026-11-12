import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#08080F',
        surface: {
          DEFAULT: '#0F0F18',
          2: '#151520',
          3: '#1A1A28',
        },
        'border-setl8': '#1E1E2E',
        primary: { DEFAULT: '#7C3AED', hover: '#6D28D9', muted: '#7C3AED1A' },
        success: { DEFAULT: '#22C55E', muted: '#22C55E1A' },
        danger: { DEFAULT: '#EF4444', muted: '#EF44441A' },
        warning: { DEFAULT: '#F59E0B', muted: '#F59E0B1A' },
        info: { DEFAULT: '#3B82F6', muted: '#3B82F61A' },
        'text-primary': '#FFFFFF',
        'text-secondary': '#8888A0',
        'text-muted': '#555570',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      backdropBlur: {
        glass: '24px',
      },
      boxShadow: {
        glass: '0 0 0 1px rgba(255,255,255,0.04), 0 4px 24px rgba(0,0,0,0.4)',
        'glass-lg': '0 0 0 1px rgba(255,255,255,0.06), 0 8px 40px rgba(0,0,0,0.5)',
        glow: '0 0 20px rgba(124, 58, 237, 0.15)',
      },
      keyframes: {
        'pulse-slow': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'shimmer': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'pulse-slow': 'pulse-slow 3s ease-in-out infinite',
        'shimmer': 'shimmer 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
