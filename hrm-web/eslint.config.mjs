import reactHooks from 'eslint-plugin-react-hooks';
import root from '../eslint.config.mjs';
import globals from 'globals';

export default [
  ...root,
  { ignores: ['.next/**', 'next-env.d.ts', 'playwright-report/**', 'test-results/**'] },
  {
    files: ['src/**/*.{ts,tsx}', 'test/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
];
