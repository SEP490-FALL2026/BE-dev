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
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      'prettier/prettier': ['error', { endOfLine: 'auto' }]
    },
    ignores: ['**/*.spec.ts']
  },
  {
    // Size and complexity (docs/rules/module-structure.md): a signal to split by use case or move branches into a
    // pure policy, never a reason to cut a file by the alphabet. An exception is an eslint-disable-next-line comment
    // with its reason, at the place itself.
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.spec.ts', 'src/generated/**'],
    rules: {
      'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 60, skipBlankLines: true, skipComments: true }],
      complexity: ['warn', 12],
      'max-params': ['warn', 8],
      'max-depth': ['warn', 4]
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
