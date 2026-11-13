/** Design tokens shared by web + mobile. Keep in sync with docs/IMPLEMENTATION_PLAN.md */
const colors = {
  primary: { DEFAULT: '#1F5FD6', soft: '#EAF1FD', dark: '#174AA8' },
  ink: { DEFAULT: '#101828', muted: '#667085' },
  canvas: '#F7F8FA',
  line: '#E4E7EC',
  success: { DEFAULT: '#12B76A', soft: '#ECFDF3' },
  warning: { DEFAULT: '#F79009', soft: '#FFFAEB' },
  danger: { DEFAULT: '#F04438', soft: '#FEF3F2' },
  night: { canvas: '#0B1220', surface: '#111A2E', line: '#22304D', ink: '#E6EAF2', muted: '#98A2B3' },
};
const radius = { sm: '8px', md: '12px', lg: '16px' };
module.exports = { colors, radius };
