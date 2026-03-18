import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: '#10a37f',
        'accent-ink': '#0f513f',
        'accent-soft': '#e8faf4',
        danger: '#b42318',
        'danger-soft': '#fef3f2',
        muted: '#6e6e80',
        ink: '#202123',
        page: '#f7f7f8',
        'page-soft': '#fbfbfc',
        'page-deep': '#ececf1',
        line: '#ececf1',
        'line-strong': '#d9d9e3',
      },
    },
  },
  plugins: [],
} satisfies Config;
