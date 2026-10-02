import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import importX from 'eslint-plugin-import-x'
import sonarjs from 'eslint-plugin-sonarjs'
import vue from 'eslint-plugin-vue'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import prettier from 'eslint-config-prettier'

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
    settings: {
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          project: ['tsconfig.json', 'client/tsconfig.json'],
          noWarnOnMultipleProjects: true,
        }),
      ],
    },
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
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: true },
      ],
    },
  },
  // The client: template rules from eslint-plugin-vue, and no type-aware rules
  // anywhere under client/. ESLint's type service cannot look inside an SFC, so
  // it cannot type an import of one either — every component arrives as an error
  // type. `vue-tsc -p client/tsconfig.json` is the type authority for the client
  // and checks templates too, which ESLint never could.
  ...vue.configs['flat/recommended'],
  {
    files: ['client/**/*.vue'],
    // vue-eslint-parser hands <script lang="ts"> to espree unless told
    // otherwise, which rejects TypeScript syntax such as `import { type X }`.
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    files: ['client/**/*.ts', 'client/**/*.vue'],
    ...tseslint.configs.disableTypeChecked,
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      // TypeScript resolves identifiers; the core rule does not understand
      // type positions and reports them as undefined globals.
      'no-undef': 'off',
      'vue/multi-word-component-names': 'off',
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
  // Last word on anything Prettier owns: formatting is not an argument (§3).
  prettier,
)
