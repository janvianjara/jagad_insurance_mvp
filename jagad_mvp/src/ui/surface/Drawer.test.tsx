import { useRef, useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Drawer } from './Drawer'
import { clampDrawerWidth, drawerWidthFromPointer } from './drawer-width'

function Harness() {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  return (
    <div>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
        Open record
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="POL-DRAFT-0219"
        subtitle="Motor · Bajaj Allianz"
        returnFocusTo={triggerRef}
      >
        <button type="button">Download</button>
        <button type="button">Share</button>
      </Drawer>
    </div>
  )
}

describe('drawer width arithmetic', () => {
  it('pins any requested width into the 340-560 band', () => {
    expect(clampDrawerWidth(100, 1600)).toBe(340)
    expect(clampDrawerWidth(9000, 1600)).toBe(560)
    expect(clampDrawerWidth(500, 1600)).toBe(500)
  })

  it('measures from the right edge, because the drawer is anchored there', () => {
    expect(drawerWidthFromPointer(1024 - 480, 1024)).toBe(480)
  })
})

describe('Drawer', () => {
  it('resizes by dragging its edge and stops at the band limits', () => {
    render(<Drawer open onClose={() => {}} title="Quotation">body</Drawer>)

    const panel = screen.getByRole('dialog')
    const grip = screen.getByRole('separator', { name: 'Drawer width' })
    expect(panel.style.width).toBe('440px')

    fireEvent.mouseDown(grip, { clientX: window.innerWidth - 440 })
    fireEvent.mouseMove(window, { clientX: window.innerWidth - 520 })
    expect(panel.style.width).toBe('520px')

    // Past the maximum the drawer refuses to grow.
    fireEvent.mouseMove(window, { clientX: window.innerWidth - 900 })
    expect(panel.style.width).toBe('560px')

    // And past the minimum it refuses to shrink.
    fireEvent.mouseMove(window, { clientX: window.innerWidth - 100 })
    expect(panel.style.width).toBe('340px')

    fireEvent.mouseUp(window)
    // Once the drag ends the pointer no longer moves the edge.
    fireEvent.mouseMove(window, { clientX: window.innerWidth - 500 })
    expect(panel.style.width).toBe('340px')
  })

  it('resizes from the keyboard, so the drawer is not mouse-only', async () => {
    const user = userEvent.setup()
    render(<Drawer open onClose={() => {}} title="Quotation">body</Drawer>)

    const grip = screen.getByRole('separator', { name: 'Drawer width' })
    grip.focus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('dialog').style.width).toBe('456px')
    await user.keyboard('{Home}')
    expect(screen.getByRole('dialog').style.width).toBe('340px')
  })

  it('un-maximises on the first Escape and closes on the second', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Open record' }))
    const panel = screen.getByRole('dialog')

    await user.click(screen.getByRole('button', { name: 'Full screen' }))
    expect(panel).toHaveAttribute('data-maximised', 'true')

    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).not.toHaveAttribute('data-maximised')
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes on a single Escape when it is not maximised', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Open record' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('returns focus to the trigger when it closes', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const trigger = screen.getByRole('button', { name: 'Open record' })
    await user.click(trigger)
    expect(trigger).not.toHaveFocus()

    await user.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
  })

  it('keeps Tab inside the panel while it is open', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Open record' }))
    const panel = screen.getByRole('dialog')

    for (let i = 0; i < 8; i += 1) {
      await user.tab()
      expect(panel.contains(document.activeElement)).toBe(true)
    }
  })

  it('renders nothing while closed', () => {
    render(<Drawer open={false} onClose={() => {}} title="Quotation">body</Drawer>)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
