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
    },
  },
  plugins: [],
};

export default config;
