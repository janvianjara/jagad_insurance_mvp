import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import spriteMarkup from '../../assets/icons.svg?raw'
import { Icon } from './Icon'
import { ICON_NAMES } from './icon-names'

describe('icon sprite', () => {
  it('defines a symbol for every declared icon name', () => {
    const missing = ICON_NAMES.filter((name) => !spriteMarkup.includes(`id="i-${name}"`))
    expect(missing).toEqual([])
  })

  it('declares a name for every symbol in the sprite', () => {
    const inSprite = [...spriteMarkup.matchAll(/id="i-([a-z-]+)"/g)].map((match) => match[1])
    expect(inSprite.sort()).toEqual([...ICON_NAMES].sort())
  })

  it('carries no emoji or raw colour literal', () => {
    expect(spriteMarkup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(spriteMarkup).not.toMatch(/\p{Extended_Pictographic}/u)
  })
})

describe('Icon', () => {
  it('references the sprite symbol for the given name', () => {
    const { container } = render(<Icon name="shield" />)
    expect(container.querySelector('use')?.getAttribute('href')).toBe('#i-shield')
  })

  it('is hidden from assistive tech when unlabelled', () => {
    const { container } = render(<Icon name="grid" />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('exposes an image role when it carries meaning on its own', () => {
    render(<Icon name="alert" label="Escalated" />)
    expect(screen.getByRole('img', { name: 'Escalated' })).toBeInTheDocument()
  })
})
