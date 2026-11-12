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
        surface: '#111111',
        'surface-2': '#161616',
        'border-setl8': '#222222',
        primary: {
          DEFAULT: '#7C3AED',
          hover: '#6D28D9',
          muted: '#7C3AED33',
        },
        success: {
          DEFAULT: '#22C55E',
          muted: '#22C55E1A',
        },
        danger: {
          DEFAULT: '#EF4444',
          muted: '#EF44441A',
        },
        warning: {
          DEFAULT: '#F59E0B',
          muted: '#F59E0B1A',
        },
        'text-primary': '#FFFFFF',
        'text-secondary': '#888888',
        'text-muted': '#555555',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'hero-glow': 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(124, 58, 237, 0.25), transparent)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'number-tick': 'numberTick 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        numberTick: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(0%)' },
        },
      },
      boxShadow: {
        'purple-glow': '0 0 30px rgba(124, 58, 237, 0.3)',
        'purple-glow-sm': '0 0 15px rgba(124, 58, 237, 0.2)',
      },
    },
  },
  plugins: [],
};

export default config;
