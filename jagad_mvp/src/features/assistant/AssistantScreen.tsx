import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { AssistantConversation } from './AssistantConversation'
import { CapabilitiesView } from './capabilities/CapabilitiesView'
import { RecentThreads } from './thread/RecentThreads'
import { newThreadId } from './thread/thread-store'

/**
 * `/assistant` — the landing view for every role that holds the grant (D-G).
 *
 * §3 resolves the apparent conflict with U1 ("the queue IS the app") by making
 * the opening turn a briefing on the person's own queue, so this screen is the
 * work summary U1 asks for, delivered conversationally, with the queue itself
 * one nav item below and one suggestion chip away.
 *
 * The screen has the prototype's two views and switches between them the same
 * way it does — one region, one at a time, the conversation's chips and
 * composer hidden while the reading page is up.
 *
 * Which view is showing lives in the URL rather than in state, because that is
 * this codebase's standing rule and it earns its keep here: "read what the
 * Assistant will not do" is a thing one person sends another a link to.
 *
 * The header itself belongs to the conversation. It used to live in this file,
 * which meant the screen's title could not be the conversation's name and the
 * conversation's own controls — its documents, its restart — had to be lifted
 * into a component that did not own them.
 *
 * Two things this screen owns and the conversation does not:
 *
 *   The thread id. A conversation needs an identity before it can be resumed at
 *   `/assistant/:threadId`, and this is where one is minted — once per visit,
 *   and again whenever somebody starts over, so the conversation they were just
 *   having keeps its address rather than being emptied out from under it. The
 *   thread itself is not created until the first question is asked, so a person
 *   who lands here and navigates away leaves nothing behind.
 *
 *   The list of earlier conversations, beside the feed. It is not a rail item:
 *   the rail is destinations and is already long, and a conversation from ten
 *   minutes ago is not a destination — it belongs next to the one you are
 *   having, the way a thread list sits beside a thread.
 */

const VIEW_PARAM = 'view'
const CAPABILITIES = 'capabilities'

export default function AssistantScreen() {
  const [params] = useSearchParams()
  const [threadId, setThreadId] = useState(newThreadId)

  if (params.get(VIEW_PARAM) === CAPABILITIES) {
    return <CapabilitiesView backTo="/assistant" />
  }

  return (
    <AssistantConversation
      threadId={threadId}
      withHeader
      aside={<RecentThreads currentThreadId={threadId} />}
      capabilitiesTo={`/assistant?${VIEW_PARAM}=${CAPABILITIES}`}
      onRestart={() => setThreadId(newThreadId())}
    />
  )
}
