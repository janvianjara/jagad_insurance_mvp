import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Accordion } from '../Accordion'
import { Card } from '../Card'
import { Drawer } from '../Drawer'
import { Modal } from '../Modal'
import { Panel } from '../Panel'
import { Popover } from '../Popover'
import { SplitView } from '../SplitView'
import { Tabs } from '../Tabs'
import { ToastProvider } from '../Toast'
import { Tooltip } from '../Tooltip'
import { useToaster } from '../toast-context'
import styles from './SurfaceGallery.module.css'

/**
 * Gallery section for `src/ui/surface`.
 *
 * The drawer is shown inside a stand-in shell rather than on its own, because
 * its behaviour only makes sense against a main column: drag the left edge
 * between 340 and 560px, maximise it, then press Escape twice.
 */

function Block({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <div className={styles.block}>
      <div className={styles.blockHead}>
        <h3 className={styles.blockTitle}>{title}</h3>
        <p className={styles.blockNote}>{note}</p>
      </div>
      {children}
    </div>
  )
}

function ToastBench() {
  const toaster = useToaster()

  return (
    <div className={styles.controlRow}>
      <button
        type="button"
        className={styles.button}
        onClick={() =>
          toaster.notify({
            tone: 'ok',
            title: 'Quotation sent to Mehta Traders',
            detail: 'QTN-0331 · 3 companies compared',
          })
        }
      >
        Positive receipt
      </button>
      <button
        type="button"
        className={styles.buttonQuiet}
        onClick={() =>
          toaster.notify({
            tone: 'bad',
            title: 'Renewal notice batch failed',
            detail: '2 of 14 addresses bounced. Nothing was sent.',
            duration: 0,
            action: { label: 'Review', onAction: () => {} },
          })
        }
      >
        Failure, stays until dismissed
      </button>
      <button
        type="button"
        className={styles.buttonQuiet}
        onClick={() =>
          toaster.notify({
            tone: 'attn',
            title: 'Four inquiries are still unassigned',
            detail: 'Two are within three hours of their TAT.',
          })
        }
      >
        Needs a person
      </button>
      <button type="button" className={styles.buttonQuiet} onClick={() => toaster.clear()}>
        Clear all
      </button>
    </div>
  )
}

export default function SurfaceGallery() {
  const [modalOpen, setModalOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const modalTriggerRef = useRef<HTMLButtonElement>(null)
  const drawerTriggerRef = useRef<HTMLButtonElement>(null)

  return (
    <div className={styles.group}>
      <Block
        title="Card"
        note="The default bounded surface: one record, one summary. The optional stripe carries U7 status; elevation never goes past step one, because a card is never the loudest thing on a screen."
      >
        <div className={styles.cardRow}>
          <Card title="POL-2291" meta="Motor private car · Bajaj Allianz" tone="ok">
            <dl className={styles.kv}>
              <dt>Final premium</dt>
              <dd>18,240.00</dd>
              <dt>Renews</dt>
              <dd>2026-11-04</dd>
            </dl>
          </Card>
          <Card
            title="CLM-0412"
            meta="Health · with insurer"
            tone="warn"
            footer="Last update 2 days ago"
          >
            <dl className={styles.kv}>
              <dt>Claimed</dt>
              <dd>1,12,000.00</dd>
              <dt>Settled</dt>
              <dd>&mdash;</dd>
            </dl>
          </Card>
          <Card
            title="INQ-0774"
            meta="Unassigned · 3h to TAT"
            tone="attn"
            actions={
              <button type="button" className={styles.buttonQuiet}>
                Assign
              </button>
            }
            onClick={() => {}}
          >
            Commercial fire for Mehta Traders. Walk-in, logged 09:12.
          </Card>
        </div>
      </Block>

      <Block
        title="Panel"
        note="A titled region of a page, ruled in brand green. Cards hold records; panels hold sections. The green rule is identity, never status."
      >
        <Panel
          title="Premium components"
          description="Recorded from the insurer's schedule. Net is the sum of the typed components; nothing here is suggested."
          actions={
            <button type="button" className={styles.buttonQuiet}>
              Edit
            </button>
          }
        >
          <dl className={styles.kv}>
            <dt>Own damage</dt>
            <dd>12,410.00</dd>
            <dt>Third party</dt>
            <dd>4,120.00</dd>
            <dt>Add-ons</dt>
            <dd>1,710.00</dd>
          </dl>
        </Panel>
      </Block>

      <Block
        title="Modal"
        note="A blocking decision. Focus is trapped, Escape closes, focus returns to the trigger. Anything that is merely more detail belongs in the drawer instead."
      >
        <div className={styles.controlRow}>
          <button
            ref={modalTriggerRef}
            type="button"
            className={styles.button}
            onClick={() => setModalOpen(true)}
          >
            Open modal
          </button>
        </div>
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Reassign four inquiries"
          description="The current owners lose them from their queue immediately."
          returnFocusTo={modalTriggerRef}
          dismissOnScrimClick={false}
          footer={
            <>
              <button
                type="button"
                className={styles.buttonQuiet}
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </button>
              <button type="button" className={styles.button} onClick={() => setModalOpen(false)}>
                Reassign
              </button>
            </>
          }
        >
          <dl className={styles.kv}>
            <dt>From</dt>
            <dd>Unassigned pool</dd>
            <dt>To</dt>
            <dd>Ritu K.</dd>
            <dt>Records</dt>
            <dd>4</dd>
          </dl>
        </Modal>
      </Block>

      <Block
        title="Popover and Tooltip"
        note="A popover is a small panel anchored to its trigger; Escape and an outside click both close it and hand focus back. A tooltip is a hint and never the only place something is said."
      >
        <div className={styles.controlRow}>
          <Popover
            label="Row actions"
            placement="bottom-start"
            trigger={(triggerProps) => (
              <button type="button" className={styles.buttonQuiet} {...triggerProps}>
                Actions
              </button>
            )}
          >
            {(close) => (
              <div>
                <button type="button" className={styles.buttonQuiet} onClick={close}>
                  Assign to me
                </button>
                <button type="button" className={styles.buttonQuiet} onClick={close}>
                  Escalate
                </button>
              </div>
            )}
          </Popover>

          <Tooltip label="Turnaround clock starts when the inquiry is logged.">
            <button type="button" className={styles.buttonQuiet}>
              What is TAT?
            </button>
          </Tooltip>
        </div>
      </Block>

      <Block
        title="Tabs"
        note="Roving tabindex: one stop for the strip, arrows between tabs, Home and End to the ends. The counts are queue depths, not decoration."
      >
        <Tabs
          label="Inquiry views"
          tabs={[
            { id: 'mine', label: 'My inquiries', count: 12 },
            { id: 'pool', label: 'Unassigned', count: 4 },
            { id: 'breached', label: 'TAT breached', count: 2 },
            { id: 'closed', label: 'Closed', count: 318, disabled: true },
          ]}
        >
          {(activeId) => <p className={styles.tabBody}>Showing the {activeId} view.</p>}
        </Tabs>
      </Block>

      <Block
        title="Accordion"
        note="Progressive disclosure for long records. Every header is a real button with aria-expanded, so the state is announced rather than implied by a rotated mark."
      >
        <Accordion
          mode="multi"
          defaultOpenIds={['kyc']}
          items={[
            {
              id: 'kyc',
              title: 'KYC documents',
              meta: '3 of 4 collected',
              content: 'PAN, address proof and photograph on file. Income proof outstanding.',
            },
            {
              id: 'policy',
              title: 'Policy documents',
              meta: 'complete',
              content: 'Proposal form, policy schedule and endorsement history.',
            },
            {
              id: 'claims',
              title: 'Claim documents',
              meta: 'none',
              content: 'No claim has been raised against this policy.',
              disabled: true,
            },
          ]}
        />
      </Block>

      <Block
        title="Toast"
        note="Receipts, not questions. A toast confirms what already happened; anything that needs an answer cannot be allowed to time out, so it is a modal instead."
      >
        <ToastProvider>
          <ToastBench />
        </ToastProvider>
      </Block>

      <Block
        title="SplitView"
        note="Two panes and a draggable divider for list-plus-detail screens. The divider is a real separator control: drag it, or focus it and use the arrow keys."
      >
        <div className={styles.splitFrame}>
          <SplitView
            defaultPrimarySize={280}
            minPrimary={200}
            minSecondary={220}
            primary={
              <div className={styles.pane}>
                <span className={styles.paneTitle}>Renewal pool</span>
                <span className={styles.listLine}>POL-2291 · 2026-11-04</span>
                <span className={styles.listLine}>POL-2288 · 2026-11-06</span>
                <span className={styles.listLine}>POL-2276 · 2026-11-11</span>
              </div>
            }
            secondary={
              <div className={styles.pane}>
                <span className={styles.paneTitle}>POL-2291</span>
                <p className={styles.blockNote}>
                  Motor private car, Bajaj Allianz. Renewal notice not yet sent.
                </p>
              </div>
            }
          />
        </div>
      </Block>

      <Block
        title="Drawer"
        note="Ported from the prototype: drag the left edge to resize between 340 and 560px, double-click it to reset, use the arrow keys once it has focus. Maximise it, then press Escape twice — the first press un-maximises, the second closes and returns focus to the trigger."
      >
        <div className={styles.shell}>
          <div className={styles.shellMain}>
            <button
              ref={drawerTriggerRef}
              type="button"
              className={styles.button}
              onClick={() => setDrawerOpen(true)}
            >
              Open POL-2291
            </button>
            <p className={styles.shellNote}>
              This column stands in for the queue the drawer opens over. It never gets squeezed
              below a usable width, however far the drawer is dragged.
            </p>
          </div>
          <Drawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            title="POL-2291"
            subtitle="Motor private car · Bajaj Allianz"
            returnFocusTo={drawerTriggerRef}
            headerActions={
              <button type="button" className={styles.buttonQuiet}>
                Download
              </button>
            }
            footer={
              <button type="button" className={styles.button}>
                Record endorsement
              </button>
            }
          >
            <dl className={styles.kv}>
              <dt>System no.</dt>
              <dd>POL-2291</dd>
              <dt>Insurer no.</dt>
              <dd>BA/MOT/44190283</dd>
              <dt>Final premium</dt>
              <dd>18,240.00</dd>
              <dt>Renews</dt>
              <dd>2026-11-04</dd>
            </dl>
            <p className={styles.shellNote}>
              Everything in this panel is recorded, not derived. The drawer is a reading surface.
            </p>
          </Drawer>
        </div>
      </Block>
    </div>
  )
}
