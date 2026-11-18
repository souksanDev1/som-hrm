/** Design tokens shared by web + mobile. Keep in sync with docs/IMPLEMENTATION_PLAN.md */
const colors = {
  primary: { DEFAULT: '#3B5BFD', soft: '#EEF2FF', dark: '#2B3ED8' },
  ink: { DEFAULT: '#0F172A', muted: '#64748B' },
  canvas: '#F4F6FB',
  line: '#E2E8F0',
  success: { DEFAULT: '#16A34A', soft: '#F0FDF4' },
  warning: { DEFAULT: '#F79009', soft: '#FFFAEB' },
  danger: { DEFAULT: '#F04438', soft: '#FEF3F2' },
  night: { canvas: '#0B1220', surface: '#111A2E', line: '#22304D', ink: '#E6EAF2', muted: '#98A2B3' },
};
const radius = { sm: '10px', md: '14px', lg: '20px' };
const shadows = {
  card: '0 1px 2px 0 rgb(15 23 42 / 0.05), 0 1px 3px 0 rgb(15 23 42 / 0.05)',
  lift: '0 6px 16px -4px rgb(15 23 42 / 0.10), 0 2px 6px -2px rgb(15 23 42 / 0.06)',
  brand: '0 8px 20px -6px rgb(59 91 253 / 0.45)',
};
module.exports = { colors, radius, shadows };
