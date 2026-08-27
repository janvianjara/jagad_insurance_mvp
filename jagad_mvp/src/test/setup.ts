import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest runs without globals, so React Testing Library's own auto-cleanup
// hook never registers. Wire it up here instead.
afterEach(cleanup)

/*
 * Route-level scenario tests mount the whole product - shell, router,
 * permission guard, repositories - so first paint is far slower than a
 * component test's, and RTL's 1s default for findBy was reporting faults that
 * were not there. Which test failed moved from run to run depending on how
 * loaded the machine was, and a suite that fails differently by machine load is
 * a suite nobody trusts.
 *
 * This raises the ceiling on how long a query MAY wait; it does not make a
 * passing test slower, because findBy resolves as soon as the element appears.
 * A genuinely broken assertion still fails, just later.
 *
 * 15s rather than 5s because a route-level test navigates across lazily loaded
 * screens, and each one is a real chunk transform in Vitest's pipeline - one
 * AppShell run spends over three minutes in transform alone. That cost is real
 * work, not a hang, and it grew with every module the build added.
 */
configure({ asyncUtilTimeout: 15_000 })
