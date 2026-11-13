import reactHooks from 'eslint-plugin-react-hooks';
import root from '../eslint.config.mjs';

export default [
  ...root,
  { ignores: ['dist/**', '.expo/**', 'ios/**', 'android/**', 'expo-env.d.ts'] },
  {
    files: ['src/**/*.{ts,tsx}', '__tests__/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
];
