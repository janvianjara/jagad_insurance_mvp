import js from '@eslint/js'
import globals from 'globals'
import importPlugin from 'eslint-plugin-import'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// Layer boundaries. `src/ui` holds presentation primitives that must stay
// reusable, so it may not reach up into feature, composite, domain or data code.
// `src/domain` and `src/data` are framework-free, so they may not import React
// or anything from the view layers.
const layerZones = [
  { target: './src/ui', from: './src/features' },
  { target: './src/ui', from: './src/components' },
  { target: './src/ui', from: './src/domain' },
  { target: './src/ui', from: './src/data' },
  { target: './src/domain', from: './src/ui' },
  { target: './src/domain', from: './src/components' },
  { target: './src/domain', from: './src/features' },
  { target: './src/domain', from: './src/app' },
  { target: './src/data', from: './src/ui' },
  { target: './src/data', from: './src/components' },
  { target: './src/data', from: './src/features' },
  { target: './src/data', from: './src/app' },
].map((zone) => ({
  ...zone,
  message: `${zone.target.replace('./', '')} may not import from ${zone.from.replace('./', '')}.`,
}))

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      import: importPlugin,
    },
    settings: {
      'import/resolver': {
        node: { extensions: ['.js', '.jsx', '.ts', '.tsx'] },
      },
    },
    rules: {
      'import/no-restricted-paths': ['error', { zones: layerZones }],
    },
  },
  {
    files: ['src/domain/**/*.{ts,tsx}', 'src/data/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react',
              message: 'src/domain and src/data must stay framework-free.',
            },
            {
              name: 'react-dom',
              message: 'src/domain and src/data must stay framework-free.',
            },
          ],
          patterns: [
            {
              group: ['react/*', 'react-dom/*'],
              message: 'src/domain and src/data must stay framework-free.',
            },
          ],
        },
      ],
    },
  },
])
