import { PageHeader } from '../../components/AppShell'
import { activeAccount, useSessionStore } from '../../app/store'
import { AssistantConversation } from './AssistantConversation'

/**
 * `/assistant` — the landing view for every role that holds the grant (D-G).
 *
 * §3 resolves the apparent conflict with U1 ("the queue IS the app") by making
 * the opening turn a briefing on the person's own queue, so this screen is the
 * work summary U1 asks for, delivered conversationally, with the queue itself
 * one nav item below and one suggestion chip away.
 *
 * The screen itself is thin on purpose: a header and the conversation. What the
 * conversation contains is decided by counts read through the projection facade
 * at render time, never by anything stored here.
 */
export default function AssistantScreen() {
  const account = useSessionStore(activeAccount)

  return (
    <>
      <PageHeader
        title="Assistant"
        meta={account ? <span>{account.roleLabel}</span> : null}
        description="Your own queue, read as you. It reports what has been recorded and never works out a premium, a settlement or a refund."
      />
      <AssistantConversation />
    </>
  )
}
