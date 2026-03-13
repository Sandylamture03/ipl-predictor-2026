import { useState } from 'react'
import MatchCard from '../components/MatchCard'
import { useMatches } from '../hooks/useApiData'

const TEAMS = ['All Teams', 'CSK', 'MI', 'RCB', 'KKR', 'GT', 'RR', 'LSG', 'SRH', 'DC', 'PBKS']

export default function PastExplorer() {
  const [teamFilter, setTeamFilter] = useState('All Teams')
  const { allMatches, loading } = useMatches()

  const completed = allMatches.filter(m => String(m.status).toLowerCase() === 'completed')
  const filtered = completed.filter(m =>
    teamFilter === 'All Teams' || m.team1_short === teamFilter || m.team2_short === teamFilter
  )

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">Past Match Explorer</h1>
        <p className="page-subtitle">Browse historical IPL results and predictions</p>
      </div>

      <div className="filter-row">
        {TEAMS.map(t => (
          <button key={t} className={`filter-btn${teamFilter === t ? ' active' : ''}`}
            onClick={() => setTeamFilter(t)}>
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="spinner" />
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="icon">History</div>
          <p>No completed matches found in the database.</p>
          <p style={{ marginTop: 8, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Run: <code style={{ color: 'var(--accent-blue)' }}>node scripts/import_cricsheet.js .\data\cricsheet</code>
          </p>
        </div>
      ) : (
        <div className="match-grid">
          {filtered.map(m => <MatchCard key={m.id} match={m} />)}
        </div>
      )}
    </div>
  )
}