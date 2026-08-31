import { Link } from 'react-router'
import { Icon } from '../../../ui/Icon'
import { BEFORE_AFTER, BY_ROLE, NEVER, REQUEST_KIND_GUIDE } from './capabilities'
import styles from './CapabilitiesView.module.css'

/**
 * "What Assistant can do" — the prototype's `#cap`, reached from the header.
 *
 * It is a reading page and it is laid out as one: a lead, then four bordered
 * groups, each with a heading that says what the group is for. No cards on a
 * grid, no statistics, nothing to press except the way back. The prototype gets
 * this right and the reason it does is that the page's job is to be believed,
 * and a page that is trying to sell is not.
 *
 * The section that matters most is the third. Everything else here describes
 * what the Assistant does; "What it will not do" describes what it cannot, and
 * that is the section a person actually needs before they will let something
 * read their customer records.
 */
export function CapabilitiesView({ backTo }: { backTo: string }) {
  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <Link className={styles.back} to={backTo}>
          <Icon name="chevron-right" size="sm" />
          Back to the conversation
        </Link>

        <h1 className={styles.title}>What the Assistant does</h1>
        <p className={styles.lead}>
          Four kinds of request. It opens showing your own work, raises things you have not asked
          about, offers the move that usually follows, and takes typing only when you want something
          unusual. Everything it reads, it reads as you.
        </p>

        <section className={styles.group} aria-labelledby="cap-kinds">
          <header className={styles.groupHead}>
            <h2 id="cap-kinds">Four kinds of request</h2>
            <p>The tag on a chip tells you which one you are about to use.</p>
          </header>

          {REQUEST_KIND_GUIDE.map((kind) => (
            <div key={kind.key} className={styles.kind} data-kind={kind.name}>
              <span className={styles.kindBar} aria-hidden="true" />
              <div>
                <h3 className={styles.kindName}>
                  {kind.name}
                  {kind.tag ? <span className={styles.kindTag}>{kind.tag}</span> : null}
                </h3>
                <p className={styles.kindSummary}>{kind.summary}</p>
                <ul className={styles.examples}>
                  {kind.examples.map((example) => (
                    <li key={example}>{example}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </section>

        <section className={styles.group} aria-labelledby="cap-change">
          <header className={styles.groupHead}>
            <h2 id="cap-change">What changes day to day</h2>
            <p>The same job, before and after.</p>
          </header>

          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Job</th>
                  <th scope="col">Today</th>
                  <th scope="col">With the Assistant</th>
                </tr>
              </thead>
              <tbody>
                {BEFORE_AFTER.map((row) => (
                  <tr key={row.key}>
                    <th scope="row">{row.job}</th>
                    <td className={styles.was}>{row.today}</td>
                    <td>{row.withAssistant}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className={styles.groupNote}>
            The saving is not in typing faster. It is in not navigating. There are no minutes on this
            table on purpose — a figure the product cannot check is a figure it should not print.
          </p>
        </section>

        <section className={styles.group} aria-labelledby="cap-never">
          <header className={styles.groupHead}>
            <h2 id="cap-never">What it will not do</h2>
            <p>Boundaries, not gaps. Each one is enforced in code, and where is named.</p>
          </header>

          {NEVER.map((rule) => (
            <div key={rule.key} className={styles.never}>
              <span className={styles.no} aria-hidden="true" />
              <div>
                <p className={styles.neverClaim}>
                  <strong>{rule.claim}.</strong> {rule.detail}
                </p>
                <p className={styles.neverWhere}>{rule.where}</p>
              </div>
            </div>
          ))}
        </section>

        <section className={styles.group} aria-labelledby="cap-roles">
          <header className={styles.groupHead}>
            <h2 id="cap-roles">By role</h2>
            <p>What each person asks for, what they can analyse, and what they can produce.</p>
          </header>

          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Role</th>
                  <th scope="col">Asks</th>
                  <th scope="col">Analyses</th>
                  <th scope="col">Produces</th>
                </tr>
              </thead>
              <tbody>
                {BY_ROLE.map((row) => (
                  <tr key={row.key}>
                    <th scope="row">{row.name}</th>
                    <td>{row.asks}</td>
                    <td>{row.analyses}</td>
                    <td>{row.produces}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className={styles.groupNote}>
            A dash is not a missing feature — it is a role for whom that kind of request has no
            subject yet. Offering a renewals officer a claim summary would teach them the Assistant
            does not know what they do.
          </p>
        </section>
      </div>
    </div>
  )
}
