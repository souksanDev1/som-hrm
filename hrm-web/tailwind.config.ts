import type { Config } from 'tailwindcss';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const preset = require('@hrm/shared/tailwind-preset');

const config: Config = {
  presets: [preset],
  content: ['./src/**/*.{ts,tsx}'],
};

export default config;
