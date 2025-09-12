// eslint.config.mjs
// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';
import prettierRecommended from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
  // 0) Ignores
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '.turbo/**',
      '.next/**',
      '*.d.ts',
      'eslint.config.mjs',
    ],
  },

  // 1) Base JS + TS recommended configs
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  // 2) Global language options (adjust sourceType if you ship ESM)
  {
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'commonjs', // change to 'module' if your TS compiles to ESM
      parserOptions: {
        // Let TS-ESLint auto-detect tsconfigs per file (great for monorepos)
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      import: importPlugin,
      'unused-imports': unusedImports,
    },
  },

  // 3) Pragmatic rules (bug catchers on, bikeshedding off)
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      // Prettier decides formatting; warn instead of screaming
      'prettier/prettier': 'warn',


      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'warn',


      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/require-await': 'warn',




      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],

      // Imports: TS resolves paths; we just nudge order for readability
      'import/no-unresolved': 'off',
      'import/order': [
        'warn',
        {
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index'], 'type'],
          pathGroups: [{ pattern: '@/**', group: 'internal', position: 'before' }],
          pathGroupsExcludedImportTypes: ['builtin'],
        },
      ],
    },
  },

  // 4) Tests: relax the “unsafe” noise so specs don’t turn into paperwork
  tseslint.config({
    files: ['**/*.spec.ts', '**/*.test.ts'],
    languageOptions: {
      globals: { ...globals.jest },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      "@@typescript-eslint/no-unsafe-argument": 'off',
      '@typescript-eslint/no-explicit-any': 'off',
       '@typescript-eslint/require-await': 'off',
      'no-console': 'off',
      '@typescript-eslint/no-unsafe-argument': 'warn'
    },
  }),

  // 5) Plain JS/Config files: don’t force TS-aware checks
  tseslint.config({
    files: ['*.js', '*.cjs', '*.mjs'],
    languageOptions: { parserOptions: { projectService: false } },
    rules: { '@typescript-eslint/no-var-requires': 'off' },
  }),

  // 6) Prettier last so it disables conflicting stylistic rules
  prettierRecommended,
);
