import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores(['**/dist/**', '**/node_modules/**', '.artifacts/**', 'artifacts/**', 'logs/**', 'miniapp/**']),
  {
    files: ['src/**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // JSX component names need an exemption; unused UPPER_CASE constants do not.
      'no-unused-vars': ['error', { varsIgnorePattern: '^(?:[A-Z][A-Za-z0-9]*|_.*)$' }],
      // These effects intentionally reset view state when their external inputs change.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: ['api/**/*.js', 'server/**/*.{js,mjs}', 'scripts/**/*.{js,mjs}', '*.config.js', 'check-amap-key.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.node,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['scripts/*smoke.mjs'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['src/**/*.{ts,tsx}', 'packages/shared/**/*.{ts,js}'],
    languageOptions: {
      parser: tseslint.parser,
      globals: { ...globals.browser, ...globals.es2022 },
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module' },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
])
