# I18n Content

Use this reference when adding or changing user-facing text, translation keys, locale files, or namespace usage.

These conventions are derived from the current boilerplate source.

## Current Shape

Locale files live under assets:

```txt
src/assets/i18n/
├── en/
│   ├── auth.json
│   ├── common.json
│   └── home.json
└── ja/
    ├── auth.json
    ├── common.json
    └── home.json
```

The i18n service uses `i18next`, `react-i18next`, and `i18next-http-backend`. Translation files are loaded by namespace.

## Usage

Use `useTranslation` in components:

```tsx
const { t } = useTranslation('common');

return <span>{t('header.login')}</span>;
```

For multiple namespaces:

```tsx
const { t } = useTranslation(['common', 'home']);

return <h1>{t('home:title')}</h1>;
```

## Namespace Conventions

Use existing namespaces when the text belongs there:

- `common`: header, footer, shared labels, shared actions
- `auth`: login/register/auth forms
- `home`: home page content

For a larger new feature, prefer a feature namespace such as `profile.json` or `bookings.json` instead of placing all text in `common`.

## Key Conventions

Prefer nested, UI-oriented keys:

```json
{
  "logIn": {
    "title": "Login",
    "username": {
      "label": "Username",
      "error": {
        "required": "Username is required"
      }
    }
  }
}
```

Keep keys stable once used by components. If renaming a key, update all locales and all call sites.

## Adding Text

When adding user-facing text:

1. Choose the namespace.
2. Add the key to every supported locale.
3. Use `useTranslation` in the component.
4. Avoid hardcoding production UI text in JSX.

Demo placeholders in the existing boilerplate may still be hardcoded. Do not copy that pattern into production feature work.

## Form Text

Form labels, button titles, and validation errors should come from i18n:

```tsx
const schema = z.object({
  username: z.string().nonempty(t('logIn.username.error.required')),
});

<Controller
  name="username"
  control={control}
  render={({ field, fieldState }) => (
    <Form.Item
      label={t('logIn.username.label')}
      htmlFor={`${formId}-username`}
      validateStatus={fieldState.error ? 'error' : undefined}
      help={fieldState.error?.message}
    >
      <Input id={`${formId}-username`} {...field} />
    </Form.Item>
  )}
/>
<Button type="primary" htmlType="submit">
  {t('logIn.btn')}
</Button>
```

An excerpt: `control` comes from `useForm` and `formId` from `useId()`; the full form pattern is in `antd-components.md`. The legacy `Input label` / `Button title` partials are for existing screens only.
