import type { ThemeConfig } from 'antd';

// Mirrors src/stylesheet/base/_variables.scss so antd components and the
// SCSS layout share one palette. Change both together.
export const ANTD_THEME: ThemeConfig = {
  token: {
    colorPrimary: '#2272c7',
    colorError: '#e61e56',
    colorWarning: '#ffb000',
    colorSuccess: '#00c853',
    colorLink: '#2272c7',
    fontFamily: '"Mulish", sans-serif',
    borderRadius: 4,
  },
};
