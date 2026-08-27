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
 * The header is the prototype's `.top`, which is two lines and nothing else: the
 * conversation, and who is having it — `csub` is "Vivek Jagad · Admin · Whole
 * business". It used to spend the largest block above the fold on a sentence
 * explaining what the screen was; the briefing underneath says that better by
 * being it, and the explanation now sits at the foot of the conversation where a
 * person reads it in the moment they are about to ask. That is most of what the
 * client meant by congested: two paragraphs of chrome before the first fact.
 */
export default function AssistantScreen() {
  const account = useSessionStore(activeAccount)

  return (
    <>
      <PageHeader
        title="Assistant"
        {...(account
          ? {
              meta: (
                <span>
                  {account.user.name} · {account.roleLabel}
                </span>
              ),
            }
          : {})}
      />
      <AssistantConversation />
    </>
  )
}
