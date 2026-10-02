import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import importX from 'eslint-plugin-import-x'
import sonarjs from 'eslint-plugin-sonarjs'

/**
 * Lint rules that carry the mechanical half of docs/constitution.md §9.
 * Everything a linter cannot judge — change size, comment necessity, the
 * 300-character doc-comment cap, naming, the privacy rules — is enforced in
 * review, by design.
 */
export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'specs/prototype/'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'import-x': importX, sonarjs },
    rules: {
      // §3 — commented-out code, and marker comments without an issue link.
      // The "has a link" half is the reviewer's; this surfaces every marker.
      'sonarjs/no-commented-code': 'error',
      'no-warning-comments': [
        'warn',
        { terms: ['todo', 'fixme', 'xxx', 'hack'], location: 'anywhere' },
      ],

      // §4 — one thing, at one level of abstraction, with no cycles.
      complexity: ['error', 10],
      'max-lines-per-function': [
        'error',
        { max: 50, skipBlankLines: true, skipComments: true },
      ],
      'max-depth': ['error', 3],
      'import-x/no-cycle': 'error',

      // §5 — nothing reaches a log by accident; PII must never leak there.
      'no-console': 'error',

      eqeqeq: ['error', 'always'],
      'no-param-reassign': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: true },
      ],
    },
  },
  {
    files: ['**/*.test.ts', 'tests/**/*.ts'],
    rules: {
      'max-lines-per-function': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['*.config.js', 'eslint.config.js', 'commitlint.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },
)
