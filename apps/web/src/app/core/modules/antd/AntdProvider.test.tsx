import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App, Button, Empty } from 'antd';
import enUS from 'antd/locale/en_US';
import jaJP from 'antd/locale/ja_JP';
import i18next from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { AntdProvider, getAntdLocale } from './AntdProvider';

// antd's <Empty> also repeats its text in the SVG <title>.
const EMPTY_TEXT = '.ant-empty-description';

const renderWithLanguage = async (lng: string, ui: React.ReactNode) => {
  const i18n = i18next.createInstance();
  await i18n.use(initReactI18next).init({ lng, resources: {} });
  const view = render(
    <I18nextProvider i18n={i18n}>
      <AntdProvider>{ui}</AntdProvider>
    </I18nextProvider>,
  );
  return { i18n, view };
};

describe('getAntdLocale', () => {
  it.each([
    ['en', enUS],
    ['ja', jaJP],
    ['ja-JP', jaJP],
    ['en-US', enUS],
  ])('maps %s to its antd locale', (language, locale) => {
    expect(getAntdLocale(language)).toBe(locale);
  });

  it('falls back to English for an unknown or missing language', () => {
    expect(getAntdLocale('fr')).toBe(enUS);
    expect(getAntdLocale(undefined)).toBe(enUS);
  });
});

describe('AntdProvider', () => {
  it('renders its children', async () => {
    await renderWithLanguage('en', <p>child content</p>);

    expect(screen.getByText('child content')).toBeInTheDocument();
  });

  it('renders its children while translations are still loading', () => {
    // A backend whose read never calls back keeps the namespace "loading".
    const neverLoadingBackend = {
      type: 'backend' as const,
      init() {},
      read() {},
    };
    const i18n = i18next.createInstance();
    // Not awaited: init never resolves while the backend hangs.
    void i18n
      .use(neverLoadingBackend)
      .use(initReactI18next)
      .init({ lng: 'en', ns: ['common'], defaultNS: 'common' });

    // No Suspense boundary: a suspending AntdProvider would render nothing.
    render(
      <I18nextProvider i18n={i18n}>
        <AntdProvider>
          <p>child content</p>
        </AntdProvider>
      </I18nextProvider>,
    );

    expect(screen.getByText('child content')).toBeInTheDocument();
  });

  it('does not wrap children in a styled .ant-app element', async () => {
    const { view } = await renderWithLanguage('en', <p>child content</p>);

    expect(view.container.querySelector('.ant-app')).toBeNull();
  });

  it('uses the antd locale of the current i18n language', async () => {
    await renderWithLanguage('ja', <Empty />);

    expect(
      screen.getByText('データがありません', { selector: EMPTY_TEXT }),
    ).toBeInTheDocument();
  });

  it('follows a language change', async () => {
    const { i18n } = await renderWithLanguage('en', <Empty />);
    expect(
      screen.getByText('No data', { selector: EMPTY_TEXT }),
    ).toBeInTheDocument();

    await act(() => i18n.changeLanguage('ja'));

    expect(
      screen.getByText('データがありません', { selector: EMPTY_TEXT }),
    ).toBeInTheDocument();
  });

  it('provides App.useApp() message to its children', async () => {
    const Notify = () => {
      const { message } = App.useApp();
      return <Button onClick={() => message.success('Saved')}>Save</Button>;
    };
    await renderWithLanguage('en', <Notify />);

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });
});
