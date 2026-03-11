import { useState } from 'react'
import MatchCard from '../components/MatchCard'
import { MOCK_MATCHES } from '../hooks/useMockData'

const TEAMS = ['All Teams', 'CSK', 'MI', 'RCB', 'KKR', 'GT', 'RR', 'LSG', 'SRH', 'DC', 'PBKS']

export default function PastExplorer() {
  const [teamFilter, setTeamFilter] = useState('All Teams')
  const completed = MOCK_MATCHES.filter(m => m.status === 'completed')
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

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📂</div>
          <p>No completed matches yet. Import Cricsheet data to populate history.</p>
          <p style={{marginTop:8, fontSize:'0.85rem', color:'var(--text-muted)'}}>
            Run: <code style={{color:'var(--accent-blue)'}}>npx ts-node scripts/import_cricsheet.ts</code>
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
