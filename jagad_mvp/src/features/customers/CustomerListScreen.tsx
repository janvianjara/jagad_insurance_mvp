import { useRepositories } from '../../app/repositories-context'
import { useResource } from '../../lib/useResource'
import { WorkQueue } from '../../components/WorkQueue'
import { Skeleton } from '../../ui/data'
import { customerDesk } from './data/customer-desk'
import { useCustomerNow } from './clock'
import { customerQueueConfig } from './queue-config'

const SCAN_SIZE = 10_000

/**
 * `/customers` — plan §4, §5's "Customer list" row.
 *
 * Configuration, not a table: `<WorkQueue>` owns the URL, the filter bar and the
 * keyboard model. The households and the city list are read here rather than
 * inside the config so the config stays a pure function of its dependencies and
 * can be tested without a repository.
 */
export function CustomerListScreen() {
  const repositories = useRepositories()
  const desk = customerDesk(repositories)
  const now = useCustomerNow()

  const context = useResource(async () => {
    const [page, users] = await Promise.all([
      repositories.customers.list({ page: 1, pageSize: SCAN_SIZE }),
      repositories.config.users(),
    ])

    const householdIds = [
      ...new Set(page.rows.map((row) => row.householdId).filter((id): id is string => id !== null)),
    ]
    const households = (
      await Promise.all(householdIds.map((id) => repositories.customers.household(id)))
    )
      .filter((view) => view !== null)
      .map((view) => view.household)

    const cities = [...new Set(page.rows.map((row) => row.city))].sort((a, b) => a.localeCompare(b))
    return { households, users, cities }
  }, 'customers:list-context')

  if (!context.data) {
    return <Skeleton width="100%" height="20rem" />
  }

  return (
    <WorkQueue
      config={customerQueueConfig({
        desk,
        households: context.data.households,
        users: context.data.users,
        cities: context.data.cities,
        now,
      })}
    />
  )
}

export default CustomerListScreen
