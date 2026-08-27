import { useRepositories } from '../../app/repositories-context'
import { useResource } from '../../lib/useResource'
import { WorkQueue } from '../../components/WorkQueue'
import { Skeleton } from '../../ui/data'
import { customerDesk } from '../customers/data/customer-desk'
import { useCustomerNow } from '../customers/clock'
import { kycQueueConfig } from './queue-config'

/**
 * `/back-office/kyc` — plan §4, §5's "KYC queue + detail" row.
 *
 * The screen is nine lines because the queue is configuration: `<WorkQueue>`
 * owns the filter bar, the URL, the stripe and the keyboard model, and
 * `kycQueueConfig` says what a KYC row is. A row opens the customer's own file,
 * which is where the checklist, the OCR review and the consent link live.
 */
export function KycQueueScreen() {
  const repositories = useRepositories()
  const desk = customerDesk(repositories)
  const now = useCustomerNow()

  const users = useResource(() => repositories.config.users(), 'kyc:queue-users')

  if (!users.data) {
    return <Skeleton width="100%" height="20rem" />
  }

  return <WorkQueue config={kycQueueConfig({ desk, users: users.data, now })} />
}

export default KycQueueScreen
