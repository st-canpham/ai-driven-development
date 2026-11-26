import React from 'react';
import { App as AntdApp, ConfigProvider, type ConfigProviderProps } from 'antd';
import enUS from 'antd/locale/en_US';
import jaJP from 'antd/locale/ja_JP';
import { useTranslation } from 'react-i18next';

import { ANTD_THEME } from './antd-theme';

type Locale = NonNullable<ConfigProviderProps['locale']>;

const ANTD_LOCALES: Record<string, Locale> = {
  en: enUS,
  ja: jaJP,
};

// Picks the antd locale for an i18next language code ("ja", "ja-JP", ...).
export const getAntdLocale = (language?: string): Locale => {
  const base = language?.split('-')[0] ?? '';
  return ANTD_LOCALES[base] ?? enUS;
};

interface AntdProviderProps {
  children: React.ReactNode;
}

// Theme + locale for every antd component, and antd's <App> so
// App.useApp() gives context-aware message / notification / modal.
// component={false}: no .ant-app wrapper div, whose font-size, line-height and
// colour would override the base SCSS.
// useSuspense: false: this sits above the app's Suspense/ErrorBoundary and
// only needs i18n.language, not translations.
export const AntdProvider = ({ children }: AntdProviderProps) => {
  const { i18n } = useTranslation(undefined, { useSuspense: false });

  return (
    <ConfigProvider
      theme={ANTD_THEME}
      locale={getAntdLocale(i18n.resolvedLanguage ?? i18n.language)}
    >
      <AntdApp component={false}>{children}</AntdApp>
    </ConfigProvider>
  );
};
