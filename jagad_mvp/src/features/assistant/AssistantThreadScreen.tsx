import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { PageHeader } from '../../components/AppShell'
import { EmptyState } from '../../ui/data'
import { AssistantConversation } from './AssistantConversation'
import { CapabilitiesView } from './capabilities/CapabilitiesView'
import { RecentThreads } from './thread/RecentThreads'
import { useThreadsStore } from './thread/thread-store'
import styles from './AssistantThreadScreen.module.css'

/**
 * `/assistant/:threadId` — a conversation, resumed.
 *
 * The landing view at `/assistant` is where a person finds out what needs them
 * today; this is where they come back to something they asked. The two are the
 * same conversation component over the same projections, and the only
 * difference between them is that this one is addressed: the thread id in the
 * URL is what lets a conversation started in the Cmd/Ctrl-K drawer be opened
 * wide, sent to a colleague, or found again in the browser's own history.
 *
 * What is on the surface is the exchange. What is one click in is the
 * provenance — under every answer, the projections it read and when. That order
 * is deliberate: a person resuming a conversation wants what was said, and the
 * question of what the Assistant was allowed to look at is one they ask once,
 * carefully, rather than on every line.
 *
 * An id this session does not know is the state worth getting right, because it
 * is the common one — a link opened tomorrow, or after a reload. It is not an
 * error and it is not a blank screen: threads are held in memory for the
 * session, that is a real limitation of a build with no backend, and the empty
 * state says so plainly and offers the way back rather than implying something
 * broke.
 */

const VIEW_PARAM = 'view'
const CAPABILITIES = 'capabilities'

export default function AssistantThreadScreen() {
  const { threadId } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const thread = useThreadsStore((state) => (threadId ? state.threads[threadId] : undefined))

  const here = threadId ? `/assistant/${threadId}` : '/assistant'

  if (params.get(VIEW_PARAM) === CAPABILITIES) {
    return <CapabilitiesView backTo={here} />
  }

  if (!threadId || !thread) {
    return (
      <>
        <PageHeader
          title="Conversation"
          breadcrumb={<Link to="/assistant">Assistant</Link>}
          meta={<span>Not in this session</span>}
        />
        <div className={styles.missing}>
          <EmptyState
            title="This conversation is not in this session"
            explanation="Conversations with the Assistant are held for as long as this browser session lasts and are never written to a record, so a link opened in a new session — or after a reload — has nothing behind it. Ask something new and it will be listed, and addressable, for the rest of the session."
            action={
              <Link className={styles.back} to="/assistant">
                Go to the Assistant
              </Link>
            }
          />
        </div>
      </>
    )
  }

  return (
    <AssistantConversation
      threadId={threadId}
      withHeader
      headerTitle="Conversation"
      breadcrumb={<Link to="/assistant">Assistant</Link>}
      aside={<RecentThreads currentThreadId={threadId} />}
      capabilitiesTo={`${here}?${VIEW_PARAM}=${CAPABILITIES}`}
      onRestart={() => {
        // A new conversation is a new address. Emptying this one in place would
        // leave the URL naming a thread that no longer holds what it named.
        void navigate('/assistant')
      }}
    />
  )
}
