import { Suspense } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { builtRoutePaths, createAppRoutes } from '../../app/router'
import { ROUTE_MAP } from '../../app/route-map'
import { PlannedRoute } from '../../app/route-screens'
import { RepositoriesProvider } from '../../app/repositories'
import { useDrawerStore, useSessionStore } from '../../app/store'
import { NO_LATENCY, createMockRepositories } from '../../data/mock'
import type { Repositories } from '../../data/repo'
import { IconSprite } from '../../ui/Icon'

/**
 * The shell is tested through the real router and the real repositories, because
 * the three promises worth holding — the rail is rendered by `can()`, the counts
 * are live, and every §4 route resolves — are only true together.
 */
let repositories: Repositories

beforeEach(() => {
  repositories = createMockRepositories({ latency: NO_LATENCY })
  useSessionStore.getState().reset()
  useDrawerStore.getState().closeDrawer()
})

afterEach(() => {
  delete document.documentElement.dataset.density
})

function renderApp(path = '/') {
  const router = createMemoryRouter(createAppRoutes(), { initialEntries: [path] })
  return render(
    <RepositoriesProvider repositories={repositories}>
      <IconSprite />
      <RouterProvider router={router} />
    </RepositoriesProvider>,
  )
}

function rail() {
  return screen.getByRole('navigation', { name: 'Main' })
}

async function signInAs(name: string) {
  const user = userEvent.setup()
  const select = await screen.findByLabelText('Signed in as')
  const option = within(select as HTMLSelectElement)
    .getAllByRole('option')
    .find((candidate) => candidate.textContent?.startsWith(name))
  await user.selectOptions(select, (option as HTMLOptionElement).value)
  return user
}

describe('booting the shell', () => {
  it('hydrates the session from the config repository and lands on the Assistant', async () => {
    renderApp('/')

    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Assistant' })).toBeInTheDocument()
  })

  it('writes the density onto the document so the tokens reach every surface', async () => {
    renderApp('/')
    await screen.findByRole('navigation', { name: 'Main' })

    await waitFor(() => expect(document.documentElement.dataset.density).toBe('comfortable'))

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Compact rows/ }))
    await waitFor(() => expect(document.documentElement.dataset.density).toBe('compact'))
  })
})

describe('the rail is rendered by can()', () => {
  it('puts the Assistant first for the signed-in role', async () => {
    renderApp('/assistant')
    const links = within(await screen.findByRole('navigation', { name: 'Main' })).getAllByRole('link')
    expect(links[0]).toHaveTextContent('Assistant')
  })

  it('shows the admin every section, configuration included', async () => {
    renderApp('/assistant')
    await screen.findByRole('navigation', { name: 'Main' })

    for (const section of ['Front office', 'Operations', 'Money', 'Records', 'Configuration']) {
      expect(within(rail()).getByRole('heading', { name: section })).toBeInTheDocument()
    }
  })

  it('changes the whole rail when the account changes', async () => {
    renderApp('/assistant')
    await screen.findByRole('navigation', { name: 'Main' })
    // The admin's configuration reaches the rail as one Settings item; the
    // twelve screens behind it are indexed on /config rather than listed here.
    expect(within(rail()).queryByRole('link', { name: /Settings/ })).toBeInTheDocument()

    await signInAs('Kiran Solanki')

    await waitFor(() => {
      expect(within(rail()).getByRole('heading', { name: 'My book' })).toBeInTheDocument()
    })
    expect(within(rail()).queryByRole('heading', { name: 'Configuration' })).toBeNull()
    expect(within(rail()).getByRole('link', { name: /My leads/ })).toBeInTheDocument()
  })

  it('drops the Assistant for the sub-agent and lands them on their leads', async () => {
    renderApp('/assistant')
    await screen.findByRole('navigation', { name: 'Main' })

    await signInAs('Meera Joshi')

    await waitFor(() => {
      expect(within(rail()).queryByRole('link', { name: /Assistant/ })).toBeNull()
    })
    expect(within(rail()).getByRole('heading', { name: 'Wallet' })).toBeInTheDocument()
    expect(within(rail()).getByRole('link', { name: /My leads/ })).toBeInTheDocument()
    // §3 lands the sub-agent on their leads, since /assistant would be refused.
    expect(await screen.findByRole('heading', { name: 'Inquiries' })).toBeInTheDocument()
  })

  it('refuses a route the account does not hold, and says so', async () => {
    renderApp('/assistant')
    await screen.findByRole('navigation', { name: 'Main' })
    await signInAs('Kiran Solanki')

    const user = userEvent.setup()
    await user.click(await screen.findByRole('link', { name: /My leads/ }))
    await screen.findByRole('heading', { name: 'Inquiries' })

    // Reach for a configuration screen the agent template does not grant.
    const router = createMemoryRouter(createAppRoutes(), { initialEntries: ['/config/users'] })
    render(
      <RepositoriesProvider repositories={repositories}>
        <RouterProvider router={router} />
      </RepositoriesProvider>,
    )

    expect(
      await screen.findByRole('heading', { name: 'Not available to this account' }),
    ).toBeInTheDocument()
  })
})

describe('live counts', () => {
  it('shows the same depth the repository reports', async () => {
    renderApp('/assistant')
    const nav = await screen.findByRole('navigation', { name: 'Main' })

    const open = await repositories.inquiries.list({
      pageSize: 1,
      filters: { status: ['new', 'assigned', 'accepted', 'reassigned', 'escalated'] },
    })
    expect(open.total).toBeGreaterThan(0)

    const link = within(nav).getByRole('link', { name: /^Inquiries/ })
    await waitFor(() => {
      expect(within(link).getByLabelText(`${open.total} open inquiries`)).toBeInTheDocument()
    })
  })
})

describe('routes', () => {
  it('leaves no route in the map resolving to a stub', () => {
    // This assertion used to point at a live unbuilt route and went stale three
    // times: /inquiries until P-11 built it, /claims until the client asked for
    // claims, then /wallet. It has now gone stale for the last possible reason -
    // every one of the 65 routes in section 4 is built, so there is no route left
    // to point it at.
    //
    // So it is inverted rather than deleted. The property worth holding is no
    // longer "an unbuilt route lands somewhere honest" but the stronger fact that
    // replaced it, and this is what will say so on the day a route is added to
    // the map with no screen behind it.
    const built = new Set(builtRoutePaths())
    const stubbed = ROUTE_MAP.filter((spec) => !built.has(spec.path)).map((spec) => spec.path)

    expect(stubbed).toEqual([])
  })

  it('still renders an honest stub for a spec with no screen behind it', async () => {
    // The mechanism outlives its last live caller. A route added to the map
    // tomorrow must still land on something that names the phase that owns it
    // rather than on a blank page, so it is exercised directly against a spec
    // rather than through a route that no longer exists. `PlannedScreen` is
    // lazy, hence the boundary and the async find.
    render(
      <MemoryRouter>
        <Suspense fallback={null}>
          <PlannedRoute
            spec={{
              path: '/not-a-route',
              title: 'Something later',
              phase: 'P3',
              layout: 'app',
              resource: null,
            }}
          />
        </Suspense>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Something later is not built yet')).toBeInTheDocument()
    expect(screen.getByText(/Planned for phase P3/)).toBeInTheDocument()
  })

  it('renders the tokenised consent page with no shell and no session', async () => {
    renderApp('/consent/abc123')

    // P-14 built this page, so the assertion is no longer about a stub. What it
    // has always been about is plan section 11.1: this route carries no session
    // BY DESIGN. Those are the two properties worth holding - a main region
    // rendered outside the shell, and a session that was never hydrated - and
    // they stay true whatever the page goes on to say.
    expect(await screen.findByRole('main')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull()
    expect(useSessionStore.getState().ready).toBe(false)
  })

  it('answers an unknown address honestly', async () => {
    renderApp('/not-a-screen')
    expect(await screen.findByText('No screen answers to that address')).toBeInTheDocument()
  })
})

describe('the Assistant drawer', () => {
  it('opens on Cmd-K carrying the current route, and closes on the second press', async () => {
    const user = userEvent.setup()
    renderApp('/policies')
    await screen.findByRole('navigation', { name: 'Main' })

    await user.keyboard('{Meta>}k{/Meta}')

    const drawer = await screen.findByRole('dialog', { name: 'Assistant' })
    expect(within(drawer).getByText('/policies')).toBeInTheDocument()

    await user.keyboard('{Control>}k{/Control}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Assistant' })).toBeNull())
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    renderApp('/policies')
    await screen.findByRole('navigation', { name: 'Main' })

    await user.keyboard('{Control>}k{/Control}')
    await screen.findByRole('dialog', { name: 'Assistant' })

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Assistant' })).toBeNull())
  })
})

/**
 * Search is the other half of the Cmd-K pair: Cmd-K asks a question, Cmd-/ finds
 * a record. Both are summoned from the shell because both are asked from
 * wherever the person already is, so both are tested here rather than in the
 * feature — what is under test is the summoning, not the palette.
 */
describe('the search palette', () => {
  it('opens on Cmd-/ from any screen, and closes on Escape', async () => {
    const user = userEvent.setup()
    renderApp('/policies')
    await screen.findByRole('navigation', { name: 'Main' })

    await user.keyboard('{Meta>}/{/Meta}')

    const palette = await screen.findByRole('dialog', { name: 'Search records' })
    expect(within(palette).getByRole('searchbox', { name: 'Search records' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Search records' })).toBeNull())
  })

  it('opens from the rail, so the keyboard path is not the only path', async () => {
    const user = userEvent.setup()
    renderApp('/policies')
    await screen.findByRole('navigation', { name: 'Main' })

    await user.click(screen.getByRole('button', { name: /Search/ }))

    expect(await screen.findByRole('dialog', { name: 'Search records' })).toBeInTheDocument()
  })

  it('reopens on an empty field rather than holding the last question', async () => {
    const user = userEvent.setup()
    renderApp('/policies')
    await screen.findByRole('navigation', { name: 'Main' })

    await user.keyboard('{Control>}/{/Control}')
    const field = await screen.findByRole('searchbox', { name: 'Search records' })
    await user.type(field, 'Patel')
    expect(field).toHaveValue('Patel')

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Search records' })).toBeNull())

    await user.keyboard('{Control>}/{/Control}')
    expect(await screen.findByRole('searchbox', { name: 'Search records' })).toHaveValue('')
  })
})
