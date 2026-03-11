import MatchCard from '../components/MatchCard'
import { useMatches } from '../hooks/useApiData'

export default function Dashboard() {
  const { liveMatches, upcomingMatches, loading } = useMatches()

  return (
    <div className="container">
      {/* ── Hero ── */}
      <section className="hero">
        <div className="hero-badge">🏆 TATA IPL 2026 · March 28 – May 31</div>
        <h1 className="hero-title">Predict. Watch. Win.</h1>
        <p className="hero-sub">
          AI-powered win predictions for every IPL 2026 match — powered by 17 years of cricket data,
          real-time scores, and machine learning.
        </p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          <StatPill value="1,000+" label="Matches Analyzed" />
          <StatPill value="84" label="IPL 2026 Matches" />
          <StatPill value="10" label="Teams" />
          <StatPill value="Live" label="Ball-by-Ball" color="var(--live-pulse)" />
        </div>
      </section>

      {loading && <div className="spinner" />}

      {/* ── Live Matches ── */}
      {liveMatches.length > 0 && (
        <section style={{ marginBottom: 40 }}>
          <h2 className="section-title"><span className="icon">⚡</span> Live Now</h2>
          <div className="match-grid">
            {liveMatches.map(m => <MatchCard key={m.id} match={m} />)}
          </div>
        </section>
      )}

      {/* ── Upcoming ── */}
      <section style={{ marginBottom: 40 }}>
        <h2 className="section-title"><span className="icon">📅</span> Upcoming Matches</h2>
        {upcomingMatches.length === 0 && !loading ? (
          <div className="empty-state">
            <div className="icon">🏏</div>
            <p>No upcoming matches yet. Schedule releases ~March 12, 2026.</p>
            <p style={{marginTop:8, fontSize:'0.85rem'}}>
              Once you import data (<code>npm run import</code>), matches will appear here.
            </p>
          </div>
        ) : (
          <div className="match-grid">
            {upcomingMatches.map(m => <MatchCard key={m.id} match={m} />)}
          </div>
        )}
      </section>
    </div>
  )
}

function StatPill({ value, label, color = 'var(--accent-blue)' }: { value: string; label: string; color?: string }) {
  return (
    <div className="stat-pill">
      <div className="stat-pill-value" style={{ color }}>{value}</div>
      <div className="stat-pill-label">{label}</div>
    </div>
  )
}
