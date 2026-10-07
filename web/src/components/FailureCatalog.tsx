import { sensorName, shortDate, parseT } from '../lib/time'
import type { FailureCatalog as Catalog, Match } from '../lib/types'

const dir = (z: number) => (z > 0 ? 'higher' : 'lower')

export function fingerprintText(fp: { sensor: string; z: number }[], n = 3) {
  return fp.slice(0, n).map((f) => `${sensorName(f.sensor)} ${dir(f.z)}`).join(', ')
}

/** One sentence on how an alert compares with failures already on record. */
export function MatchLine({ match, thresholds }: { match?: Match | null; thresholds?: Catalog['thresholds'] }) {
  if (!match) return <div className="match hint">No earlier recorded failure to compare with yet.</div>
  const date = shortDate(parseT(match.failure))
  const pct = Math.round(match.similarity * 100)
  if (match.level === 'weak') {
    return (
      <div className="match">
        <b>No close match.</b> Closest recorded failure is {date} ({pct}% alike), below the {thresholds ? Math.round(thresholds.possible * 100) : 51}% needed
        to call it similar. This is probably a new pattern.
      </div>
    )
  }
  return (
    <div className="match">
      <b>{match.level === 'strong' ? 'Strong match' : 'Possible match'}</b> to the {date} failure ({pct}% alike).
      That failure showed {fingerprintText(match.fingerprint)}.
    </div>
  )
}

export default function FailureCatalog({ catalog }: { catalog: Catalog | null }) {
  if (!catalog) return null
  return (
    <section className="card" style={{ marginTop: 16 }}>
      <h2>Recorded failures and their fingerprints</h2>
      <p className="sub">
        The sensor pattern in the hours before each failure. A new alert is compared with these. Similarity above{' '}
        {Math.round(catalog.thresholds.possible * 100)}% counts as possible, above {Math.round(catalog.thresholds.strong * 100)}% as strong
        (set from how often ordinary false alarms resemble a failure by chance).
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Failure</th><th className="num">Caught ahead</th><th>Fingerprint (vs normal)</th><th>Most similar other failure</th></tr>
          </thead>
          <tbody>
            {catalog.failures.map((f) => (
              <tr key={f.failure}>
                <td>{shortDate(parseT(f.failure))}</td>
                <td className="num">{f.lead_hours ? `${Math.round(f.lead_hours)} h` : 'Missed'}</td>
                <td>{fingerprintText(f.fingerprint, 4)}</td>
                <td>{f.most_similar ? `${shortDate(parseT(f.most_similar.failure))} (${Math.round(f.most_similar.similarity * 100)}%)` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        Every failure here looks different from the others, so expect most new alerts to read as new patterns.
        Matching becomes useful once failure modes repeat.
      </p>
    </section>
  )
}
