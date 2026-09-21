import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['node_modules/', 'dist/', 'dist-electron/', 'dist-tools/', 'release/', 'drizzle/', 'playwright-report/', 'test-results/'] },
  { files: ['**/*.test.ts', 'e2e/**/*.ts'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Renderer React code
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // Plain node scripts (scripts/*.mjs, config files, fixture server)
    files: ['*.config.{js,mjs,ts}', 'scripts/**/*.mjs', 'e2e/fixtures/**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', require: 'readonly', module: 'readonly' } },
  },
  {
    // Sandboxed preload must stay CommonJS (ESM is unavailable with sandbox=true)
    files: ['src/preload/**/*.cts'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
);
