import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAppRoutes } from '../../app/router'
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
    expect(within(rail()).queryByRole('link', { name: /Users/ })).toBeInTheDocument()

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
  it('resolves a built-nowhere-yet route to the step that will build it', async () => {
    renderApp('/inquiries')

    expect(await screen.findByText('Inquiries is not built yet')).toBeInTheDocument()
    expect(screen.getByText(/playbook step P-11/)).toBeInTheDocument()
  })

  it('renders the tokenised consent page with no shell and no session', async () => {
    renderApp('/consent/abc123')

    expect(await screen.findByText('Consent is not built yet')).toBeInTheDocument()
    expect(screen.getByText('abc123')).toBeInTheDocument()
    // No rail, so nothing on this page could have read a user.
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
