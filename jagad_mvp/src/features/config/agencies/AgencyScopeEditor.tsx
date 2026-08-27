import { useState } from 'react'
import { reasonOf } from '../../../domain/workflows'
import { Checkbox, Field, NumberInput } from '../../../ui/form'
import { Badge } from '../../../ui/signal'
import {
  GatedAction,
  bpFromPercent,
  companyById,
  percentFromBp,
  readPercent,
  scopeInsideAppointedCompanies,
  scopesOfAgency,
  useMarketStore,
} from '../shared'
import type { ConfigAgency, ScopeDraftRow } from '../shared'
import layout from '../shared/config-layout.module.css'
import styles from '../shared/market-panels.module.css'

/**
 * The per-agency policy scope and the rate each line came with — FR-07.2 and
 * FR-07.3.
 *
 * What is ticked here is what placement will offer (FR-07.4), which is why the
 * save is one previewed change rather than a checkbox that writes as it is
 * clicked: taking a policy out of scope stops a deal being placeable on it.
 *
 * The percentage is a percentage. It is stored as integer basis points, it is
 * never multiplied by anything on this screen, and no amount is derived from it
 * anywhere in this step — the chain that turns a rate into money is P-16's.
 * A rate nobody has agreed reads "Not set", never zero.
 */
export function AgencyScopeEditor({ agency }: { agency: ConfigAgency }) {
  const companies = useMarketStore((state) => state.companies)
  const products = useMarketStore((state) => state.products)
  const scopes = useMarketStore((state) => state.scopes)
  const saveAgencyScope = useMarketStore((state) => state.saveAgencyScope)

  const saved = scopesOfAgency(scopes, agency.id).map((scope) => ({
    productId: scope.productId,
    commissionPercentBp: scope.commissionPercentBp,
  }))

  const [draft, setDraft] = useState<readonly ScopeDraftRow[]>(saved)

  const appointed = agency.companyIds
    .map((companyId) => companyById(companies, companyId))
    .filter((company) => company !== null)

  function labelOf(productId: string): string {
    const product = products.find((candidate) => candidate.id === productId)
    return product ? `${product.name} (${product.code})` : productId
  }

  const inside = scopeInsideAppointedCompanies({
    appointedCompanyIds: agency.companyIds,
    chosen: draft.map((row) => ({
      companyId: products.find((product) => product.id === row.productId)?.companyId ?? '',
      label: labelOf(row.productId),
    })),
  })

  const added = draft.filter((row) => !saved.some((entry) => entry.productId === row.productId))
  const removed = saved.filter((row) => !draft.some((entry) => entry.productId === row.productId))
  const rerated = draft.filter((row) => {
    const before = saved.find((entry) => entry.productId === row.productId)
    return before !== undefined && before.commissionPercentBp !== row.commissionPercentBp
  })
  const changed = added.length > 0 || removed.length > 0 || rerated.length > 0

  function toggle(productId: string, on: boolean) {
    setDraft((rows) =>
      on
        ? [...rows, { productId, commissionPercentBp: null }]
        : rows.filter((row) => row.productId !== productId),
    )
  }

  return (
    <div className={layout.stack}>
      {appointed.length === 0 ? (
        <p className={styles.hint}>
          Appoint this agency to a company first. Until then there is no policy it could place.
        </p>
      ) : null}

      {appointed.map((company) => {
        const catalogue = products.filter(
          (product) => product.companyId === company.id && product.active,
        )

        return (
          <div key={company.id} className={layout.tight} data-scope-company={company.id}>
            <div className={styles.chips}>
              <span className={styles.section}>{company.name}</span>
              <Badge tone="neutral">{catalogue.length} products</Badge>
            </div>

            {catalogue.length === 0 ? (
              <p className={styles.hint}>This company has no active product to place.</p>
            ) : (
              <ul className={styles.rows}>
                {catalogue.map((product) => {
                  const row = draft.find((entry) => entry.productId === product.id)
                  const inScope = row !== undefined

                  return (
                    <li
                      key={product.id}
                      className={styles.scopeRow}
                      data-scope-product={product.id}
                      data-in-scope={inScope || undefined}
                    >
                      <Checkbox
                        label={`${product.name} (${product.code})`}
                        description={inScope ? undefined : 'Not offered at placement'}
                        checked={inScope}
                        onChange={(event) => toggle(product.id, event.target.checked)}
                      />

                      {inScope ? (
                        <Field
                          label={`Commission on ${product.code}`}
                          hint={readPercent(row.commissionPercentBp)}
                        >
                          <NumberInput
                            unit="%"
                            min={0}
                            max={100}
                            step={0.01}
                            value={percentFromBp(row.commissionPercentBp)}
                            onValueChange={(value) =>
                              setDraft((rows) =>
                                rows.map((entry) =>
                                  entry.productId === product.id
                                    ? { ...entry, commissionPercentBp: bpFromPercent(value) }
                                    : entry,
                                ),
                              )
                            }
                          />
                        </Field>
                      ) : (
                        <span className={styles.hint}>No rate</span>
                      )}

                      <span className={styles.hint}>
                        {inScope ? readPercent(row.commissionPercentBp) : '—'}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}

      {inside.ok ? null : (
        <p role="alert" className={styles.refusal}>
          {reasonOf(inside)}
        </p>
      )}

      <GatedAction
        label="Save policy scope"
        variant="primary"
        title={`Save the policy scope for ${agency.name}`}
        disabled={!changed || !inside.ok}
        changes={[
          ...(added.length > 0
            ? [
                {
                  key: 'added',
                  label: 'Placeable from now on',
                  to: added.map((row) => labelOf(row.productId)).join(', '),
                },
              ]
            : []),
          ...(removed.length > 0
            ? [
                {
                  key: 'removed',
                  label: 'No longer placeable',
                  from: removed.map((row) => labelOf(row.productId)).join(', '),
                  to: 'Out of scope',
                },
              ]
            : []),
          ...rerated.map((row) => ({
            key: `rate-${row.productId}`,
            label: `Commission on ${labelOf(row.productId)}`,
            from: readPercent(
              saved.find((entry) => entry.productId === row.productId)?.commissionPercentBp ?? null,
            ),
            to: readPercent(row.commissionPercentBp),
          })),
        ]}
        note="Placement offers exactly what is in scope here. Deals already placed keep the companies and products they were placed with."
        confirmLabel="Save scope"
        toast={{ title: 'Policy scope saved', detail: agency.name }}
        onConfirm={() => saveAgencyScope(agency.id, draft)}
      />
    </div>
  )
}
