import type { ReactNode } from 'react'
import { BrandMark } from '../../ui/BrandMark'
import { Icon, ICON_NAMES } from '../../ui/Icon'
import {
  BRAND_SWATCHES,
  DENSITY_ROWS,
  RADIUS_STEPS,
  SHADOW_STEPS,
  SPACE_STEPS,
  STATUS_SWATCHES,
  SURFACE_SWATCHES,
  TYPE_STEPS,
} from './gallery-data'
import type { Swatch } from './gallery-data'
import styles from './GalleryPage.module.css'

function Section({
  title,
  note,
  children,
}: {
  title: string
  note: string
  children: ReactNode
}) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2>{title}</h2>
        <p className={styles.sectionNote}>{note}</p>
      </div>
      {children}
    </section>
  )
}

function SwatchGrid({ swatches }: { swatches: Swatch[] }) {
  return (
    <div className={styles.swatchGrid}>
      {swatches.map((swatch) => (
        <div key={swatch.token} className={styles.swatch}>
          <div className={styles.swatchChip} style={{ background: `var(${swatch.token})` }} />
          <div className={styles.swatchMeta}>
            <span className={styles.swatchToken}>{swatch.token}</span>
            <span className={styles.swatchRole}>{swatch.role}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function DensityPane({ density, title }: { density: 'comfortable' | 'compact'; title: string }) {
  return (
    <div className={styles.densityPane} data-density={density}>
      <div className={styles.densityHead}>
        <span>{title}</span>
        <span className={styles.caps}>data-density=&quot;{density}&quot;</span>
      </div>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.stripe} aria-label="Status stripe" />
            <th>Record</th>
            <th>Customer</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {DENSITY_ROWS.map((row) => (
            <tr key={row.id}>
              <td className={styles.stripe} style={{ background: `var(--${row.tone})` }} />
              <td className={styles.mono}>{row.id}</td>
              <td>{row.name}</td>
              <td>
                <span
                  className={styles.pill}
                  style={{ background: `var(--${row.tone}-soft)`, color: `var(--${row.tone})` }}
                >
                  {row.state}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 'var(--sp-2)', padding: 'var(--pad-x)' }}>
        <button type="button" className={styles.button}>
          Assign
        </button>
        <button type="button" className={`${styles.button} ${styles.buttonQuiet}`}>
          Escalate
        </button>
        <input className={styles.input} placeholder="Filter" aria-label="Filter" />
      </div>
    </div>
  )
}

/**
 * Dev-only reference for the §2 design system: every token in the file, rendered
 * at the size and in the role it is meant for, in both densities. Mounted only
 * under `import.meta.env.DEV` — it never ships in a production bundle.
 */
export default function GalleryPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <BrandMark size="md" label="Design gallery" />
          <span className={styles.headerNote}>
            Plan §2 tokens. Navy carries action and navigation, green is brand and positive status
            only, lime marks what needs a person.
          </span>
        </div>
        <span className={styles.caps}>dev only</span>
      </header>

      <div className={styles.body}>
        <Section
          title="Brand palette"
          note="Read off the logo: forest green graduating to chartreuse, navy under the wordmark, cornflower blue in the stacked bars."
        >
          <SwatchGrid swatches={BRAND_SWATCHES} />
        </Section>

        <Section
          title="Status tokens"
          note="UX charter U7. Green never competes with itself: it means brand and good, never a button."
        >
          <SwatchGrid swatches={STATUS_SWATCHES} />
          <div className={styles.pillRow}>
            {STATUS_SWATCHES.map((swatch) => {
              const name = swatch.token.replace('--', '')
              return (
                <span
                  key={name}
                  className={styles.pill}
                  style={{ background: `var(--${name}-soft)`, color: `var(--${name})` }}
                >
                  <Icon name="check" size="sm" />
                  {name}
                </span>
              )
            })}
          </div>
        </Section>

        <Section
          title="Surfaces and ink"
          note="Neutrals carry a faint green bias so they sit under the brand rather than beside it."
        >
          <SwatchGrid swatches={SURFACE_SWATCHES} />
        </Section>

        <Section
          title="Type scale"
          note="IBM Plex Sans for chrome, IBM Plex Mono for every id, amount and tabular date."
        >
          {TYPE_STEPS.map((step) => (
            <div key={step.token} className={styles.typeRow}>
              <span className={styles.swatchToken}>{step.token}</span>
              <span className={styles.typeSample} style={{ fontSize: `var(${step.token})` }}>
                Rakesh Patel — {step.use}
              </span>
            </div>
          ))}
          <div className={styles.typeRow}>
            <span className={styles.swatchToken}>--font-mono</span>
            <span className={styles.mono}>POL-DRAFT-0219 · APP-0774 · CLM-0412 · 12,48,500.00</span>
          </div>
          <div className={styles.docSample}>
            <h4>Quotation for Rakesh Patel</h4>
            Source Serif 4 appears only inside generated documents, so a produced PDF reads as a
            document and visibly not as application chrome.
          </div>
        </Section>

        <Section title="Spacing scale" note="Four pixel base, ten steps, nothing between them.">
          {SPACE_STEPS.map((token) => (
            <div key={token} className={styles.spaceRow}>
              <span className={styles.swatchToken}>{token}</span>
              <div className={styles.spaceBar} style={{ width: `var(${token})` }} />
            </div>
          ))}
        </Section>

        <Section title="Radius and elevation" note="Four radii, three elevation steps, no more.">
          <div className={styles.boxRow}>
            {RADIUS_STEPS.map((token) => (
              <div key={token} className={styles.box} style={{ borderRadius: `var(${token})` }}>
                {token}
              </div>
            ))}
          </div>
          <div className={styles.boxRow}>
            {SHADOW_STEPS.map((token) => (
              <div
                key={token}
                className={styles.box}
                style={{ boxShadow: `var(${token})`, border: 'none' }}
              >
                {token}
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Icons"
          note="One sprite, geometry ported from the prototype, stroked with currentColor. No emoji anywhere in the product."
        >
          <div className={styles.iconGrid}>
            {ICON_NAMES.map((name) => (
              <div key={name} className={styles.iconCell}>
                <Icon name={name} size="lg" />
                <span className={styles.iconName}>{name}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Density"
          note="U2: the same screen, both densities, side by side. Row height, control height, padding and font step all move from one attribute."
        >
          <div className={styles.densityPair}>
            <DensityPane density="comfortable" title="Comfortable" />
            <DensityPane density="compact" title="Compact" />
          </div>
        </Section>

        <Section
          title="Focus"
          note="Lime is the attention accent, so it is also the focus ring: tab through these and the ring marks the one element that needs the person."
        >
          <div className={styles.focusRow}>
            <button type="button" className={styles.button}>
              Primary action
            </button>
            <button type="button" className={`${styles.button} ${styles.buttonQuiet}`}>
              Secondary
            </button>
            <input className={styles.input} placeholder="Search" aria-label="Search" />
            <a href="#top">A link</a>
          </div>
        </Section>
      </div>
    </div>
  )
}
