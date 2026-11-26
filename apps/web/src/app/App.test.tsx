import React, { type ReactElement } from 'react';
import { render as renderUi, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { AntdProvider } from './core/modules/antd/AntdProvider';
import { AuthProvider } from './shared/contexts/auth.context';

const { render } = vi.hoisted(() => ({ render: vi.fn() }));

vi.mock('react-dom/client', () => ({
  createRoot: vi.fn(() => ({ render })),
}));

// The real service loads locale JSON over HTTP; the bootstrap does not need it.
vi.mock('./core/services/i18n.service', async () => {
  const { default: i18next } = await import('i18next');
  return { default: i18next.createInstance() };
});

type ElementWithChildren = ReactElement<{ children: ReactElement }>;

describe('App bootstrap', () => {
  let Root: typeof import('./App').Root;

  beforeAll(async () => {
    document.body.innerHTML = '<div id="root"></div>';
    ({ Root } = await import('./App'));
  });

  it('renders i18n → antd → auth → router, in that order', () => {
    expect(render).toHaveBeenCalledTimes(1);
    const i18nNode = render.mock.calls[0][0] as ElementWithChildren;
    const antdNode = i18nNode.props.children as ElementWithChildren;
    const authNode = antdNode.props.children as ElementWithChildren;

    expect(i18nNode.type).toBe(I18nextProvider);
    expect(antdNode.type).toBe(AntdProvider);
    expect(authNode.type).toBe(AuthProvider);
    expect(authNode.props.children.type).toBe(RouterProvider);
  });

  it('Root renders the matched child route', async () => {
    const router = createMemoryRouter([
      {
        path: '/',
        Component: Root,
        children: [{ index: true, element: <p>home page</p> }],
      },
    ]);

    renderUi(<RouterProvider router={router} />);

    expect(await screen.findByText('home page')).toBeInTheDocument();
  });
});
