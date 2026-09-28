import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: { extend: { colors: { ink: '#14261f', forest: '#174d3b', mint: '#d5f36a', paper: '#f5f6f1' }, boxShadow: { card: '0 18px 55px rgba(20,38,31,.08)' } } },
  plugins: []
};
export default config;
