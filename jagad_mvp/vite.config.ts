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
    /*
     * Capped, because the suite was failing by machine load rather than by
     * fault.
     *
     * Vitest sizes its fork pool to the core count. Each fork carries jsdom plus
     * the React Compiler transform, so on this 8 GB machine a full-width run put
     * node's resident set at roughly 1.4 GB against very little free memory and
     * the workers began to swap. What that looks like from the outside is two to
     * four failures per run, a different set each time, always a timeout waiting
     * for an element and never a failed assertion — and every one of them passing
     * when the file is run on its own.
     *
     * Raising the timeout again would only buy a slower way to fail: the workers
     * are not slow, they are contending. Capping the pool is what removes the
     * contention, and it is what makes a red gate mean something. The suite is
     * the slower for it, and a gate that fails differently on every machine is
     * worth more time than it costs.
     *
     * `maxWorkers` is the vitest 4 spelling, checked against the installed
     * 4.1.11 rather than recalled: v3's `poolOptions.forks.maxForks` is gone and
     * the setting is now top level on `test`.
     */
    maxWorkers: 3,
    css: false,
  },
})
