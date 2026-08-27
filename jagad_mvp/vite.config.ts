import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Scenario tests mount the entire product. The 5s default was tripping them
    // under parallel load rather than catching real faults - see the same
    // reasoning in src/test/setup.ts.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    css: false,
  },
})
