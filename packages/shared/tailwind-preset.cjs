/**
 * Shared Tailwind preset (design 1a — Minimal & Professional).
 * Used by both hrm-web (Tailwind) and hrm-mobile (NativeWind) so the
 * two apps stay visually consistent.
 */
const { colors, radius, shadows } = require('./tokens.cjs');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors,
      borderRadius: radius,
      boxShadow: shadows,
      fontFamily: {
        sans: ['"IBM Plex Sans"', '"Noto Sans Lao"', 'system-ui', 'sans-serif'],
      },
    },
  },
};
