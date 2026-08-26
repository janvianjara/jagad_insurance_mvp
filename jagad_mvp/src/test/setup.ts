import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest runs without globals, so React Testing Library's own auto-cleanup
// hook never registers. Wire it up here instead.
afterEach(cleanup)
