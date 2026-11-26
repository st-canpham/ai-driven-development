# Ant Design Components and Forms

Use this reference when building UI: picking components, showing feedback (message / notification / modal), or building forms.

## Setup (already wired)

- `antd` v6 is the component library. `core/modules/antd/AntdProvider.tsx` wraps the app (inside `I18nextProvider`, outside `AuthProvider`) with:
  - `ConfigProvider` with `theme={ANTD_THEME}` (`core/modules/antd/antd-theme.ts`) and the antd `locale` for the current i18n language (`en` → `en_US`, `ja` → `ja_JP`; it follows `i18n.changeLanguage`).
  - antd's `<App component={false}>` so `App.useApp()` returns `message`, `notification` and `modal` that read the theme and locale. `component={false}` keeps antd from adding a `.ant-app` wrapper div, whose font size and colour would override the base SCSS on every screen.
- Theme tokens mirror `src/stylesheet/base/_variables.scss`. Change a color in both places together, never only one.
- `@ant-design/icons` is installed at the version antd itself depends on (one copy in the lockfile). Keep the two in step when upgrading antd.
  - Import each icon by name: `import { DeleteOutlined } from '@ant-design/icons';`. Never import the whole package or build icon names dynamically; both defeat tree-shaking.
  - Pass icons through antd props where they exist (`<Button icon={<PlusOutlined />}>`). An icon-only button needs an accessible name: `aria-label={t('...')}`.
  - Use the SVGs in `src/assets/icons` (via `vite-plugin-svgr`) only for icons antd does not have.
- antd date components use dayjs. Before adding a `DatePicker`/`TimePicker` shown in Japanese, add `dayjs` as a direct dependency and load `dayjs/locale/ja` alongside the antd locale.

## Which component

- Use antd components for UI controls and data display: `Button`, `Input`, `Select`, `DatePicker`, `Form`, `Table`, `Modal`, `Card`, `Tag`, `Alert`, `Spin`, `Empty`, `Pagination`, `Typography`, `Space`, `Flex`, and so on.
- Do not hand-build a control antd already provides. Do not add another UI kit.
- The legacy `shared/components/partials` (`Button`, `Input`) stay until a screen that uses them is reworked; new code uses antd. Do not mix them in one form.
- Wrap an antd component in `shared/components/` only when the app repeats a configuration (e.g. a `RoomStatusTag`), not to rename it.

## Feedback: message, notification, modal

Always take them from `App.useApp()` so they get the theme and locale. Do not call the static `message.success(...)`, `notification.open(...)` or `Modal.confirm(...)`: they render outside the providers.

```tsx
import { App } from 'antd';

const RoomActions = () => {
  const { message, modal } = App.useApp();
  const { t } = useTranslation('rooms');

  const handleDelete = () =>
    modal.confirm({
      title: t('delete.confirm'),
      onOk: async () => {
        await roomService.remove(id);
        message.success(t('delete.success'));
      },
    });
  // ...
};
```

User-facing text in any of them still comes from i18n.

## Forms: React Hook Form + Zod through `Controller`

React Hook Form owns form state and validation (Zod schema via `zodResolver`). antd supplies only the layout and the controls. Do **not** use antd's own form store (`Form.useForm`, `Form.Item name=…`, `rules`).

- `<Form layout="vertical" onFinish={handleSubmit(onSubmit)}>` for the layout; `onFinish` fires on submit via `htmlType="submit"`.
- One `<Form.Item>` per field **without** `name`, with `label`, `validateStatus` and `help` taken from RHF's `fieldState`.
- Without `name`, antd does not link the label to the control: pass `htmlFor` on `Form.Item` and the same `id` on the control (a `useId()` prefix keeps ids unique). Otherwise the label is not accessible and `getByLabelText` finds nothing.
- The control goes inside `<Controller>`; spread `field` into it. antd controls are controlled components, so `register()` does not work with them.
- Build the Zod schema inside the component (or a hook) when messages come from `t()`, as `Login.tsx` does.

```tsx
import React, { useId } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Form, Input, InputNumber } from 'antd';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

const RoomForm = ({ onSubmit }: RoomFormProps) => {
  const { t } = useTranslation('rooms');
  const formId = useId();
  const schema = z.object({
    name: z.string().min(1, t('form.name.required')),
    capacity: z.number({ message: t('form.capacity.required') }).int().positive(),
  });
  type RoomFormValues = z.infer<typeof schema>;

  const { control, handleSubmit, formState } = useForm<RoomFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', capacity: undefined },
  });

  return (
    <Form layout="vertical" onFinish={handleSubmit(onSubmit)}>
      <Controller
        name="name"
        control={control}
        render={({ field, fieldState }) => (
          <Form.Item
            label={t('form.name.label')}
            htmlFor={`${formId}-name`}
            validateStatus={fieldState.error ? 'error' : undefined}
            help={fieldState.error?.message}
          >
            <Input id={`${formId}-name`} {...field} />
          </Form.Item>
        )}
      />
      <Controller
        name="capacity"
        control={control}
        render={({ field, fieldState }) => (
          <Form.Item
            label={t('form.capacity.label')}
            htmlFor={`${formId}-capacity`}
            validateStatus={fieldState.error ? 'error' : undefined}
            help={fieldState.error?.message}
          >
            <InputNumber id={`${formId}-capacity`} {...field} min={1} />
          </Form.Item>
        )}
      />
      <Button type="primary" htmlType="submit" loading={formState.isSubmitting}>
        {t('form.submit')}
      </Button>
    </Form>
  );
};
```

When a form repeats the `Controller` + `Form.Item` pair a lot, extract a small `shared/components/form/FormField.tsx` that takes `name`, `control`, `label` and a render function, and wires `htmlFor`/`id` itself. Do not reintroduce antd's form store to save lines.

## Styling antd

- Change look through theme tokens (`ANTD_THEME.token`, or `components.<Name>` for one component), not by overriding `.ant-*` classes in SCSS.
- Use props (`size`, `type`, `variant`, `block`) and layout components (`Flex`, `Space`, `Row`/`Col`) before writing CSS.
- SCSS is for page and layout structure only; see `ui-styling.md`.

## Tests

- antd renders in jsdom. Query by role and label (`getByRole('button', { name })`, `getByLabelText`), as for any component.
- Wrap the component in `AntdProvider` (inside an `I18nextProvider`) when it uses `App.useApp()` or locale text; see `core/modules/antd/AntdProvider.test.tsx`.
- Some antd components repeat text (e.g. `Empty` puts it in an SVG `<title>`); scope the query with `selector` or use the role instead of `getAllBy…`.
