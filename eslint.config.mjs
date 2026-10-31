// @ts-check
import eslint from '@eslint/js'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', 'src/generated/**']
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  {
    // R8 (docs/rules/module-structure.md): every rule is an error. There is no warning level and no --max-warnings: a
    // directive that no longer silences anything is reported too, in every file (specs included), so nothing passes by
    // being only a warning.
    linterOptions: {
      reportUnusedDisableDirectives: 'error'
    }
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      'prettier/prettier': ['error', { endOfLine: 'auto' }]
    },
    ignores: ['**/*.spec.ts']
  },
  {
    // Size and complexity (docs/rules/module-structure.md): a signal to split by use case or move branches into a
    // pure policy, never a reason to cut a file by the alphabet. The violations that existed when the rules became
    // errors (OD-R4) are recorded in eslint-suppressions.json (`eslint --suppress-all`), counted per file and rule: a
    // new violation in any file fails `pnpm lint`, and fixing one fails it too until `pnpm lint:prune` removes its
    // suppression, so the debt can only shrink. A single justified exception is an eslint-disable-next-line comment
    // with its reason, at the place itself.
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.spec.ts', 'src/generated/**'],
    rules: {
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
      complexity: ['error', 12],
      'max-params': ['error', 8],
      'max-depth': ['error', 4]
    }
  },
  {
    // *.http-errors.ts files are flat instanceof → HTTP answer tables: one branch per error, in an order that matters for
    // subclasses. Their size is the number of errors they answer, not logic.
    files: ['src/modules/**/*.http-errors.ts'],
    rules: {
      complexity: 'off',
      'max-lines-per-function': 'off'
    }
  }
)
