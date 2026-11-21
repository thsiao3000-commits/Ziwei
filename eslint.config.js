import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'test-results', 'playwright-report'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // 介面文案用全形空白分隔詞組，字串與 JSX 文字裡允許。
      'no-irregular-whitespace': ['error', { skipStrings: true, skipTemplates: true, skipJSXText: true }],
      // CLAUDE.md 規則 6：只有 engine.ts 可以 import iztro。
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'iztro',
              message: '只有 src/features/chart/engine.ts 可以 import iztro。',
            },
          ],
          patterns: [{ group: ['iztro/*'], message: '只有 engine.ts 可以 import iztro。' }],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          // CLAUDE.md 規則 8：本站與其他網站同網域、共用儲存空間。
          selector:
            "CallExpression[callee.property.name='clear'][callee.object.name=/^(localStorage|sessionStorage)$/]",
          message: '禁止 clear()：會清掉同網域其他網站的資料。請用 lib/storage 的 clearSiteData()。',
        },
        {
          selector:
            "CallExpression[callee.property.name='clear'][callee.object.property.name=/^(localStorage|sessionStorage)$/]",
          message: '禁止 clear()：會清掉同網域其他網站的資料。請用 lib/storage 的 clearSiteData()。',
        },
        {
          // CLAUDE.md 規則 5、HANDOFF 第 9 節。
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: '不使用 dangerouslySetInnerHTML。',
        },
      ],
    },
  },
  {
    files: ['src/features/chart/engine.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['*.config.{js,ts}', 'e2e/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
);
