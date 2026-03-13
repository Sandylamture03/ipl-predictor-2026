import { useState } from 'react'
import MatchCard from '../components/MatchCard'
import { useMatches } from '../hooks/useApiData'

const FILTERS = ['All', 'Upcoming', 'Live', 'Completed']

export default function UpcomingMatches() {
  const [filter, setFilter] = useState('All')
  const { allMatches, loading } = useMatches()

  const filtered = allMatches.filter(m => {
    if (filter === 'All') return true
    const status = String(m.status || '').toLowerCase()
    if (filter === 'Upcoming') return status === 'upcoming' || status === 'scheduled'
    return status === filter.toLowerCase()
  })

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">IPL 2026 Fixtures</h1>
        <p className="page-subtitle">All 84 matches with AI win predictions updated before each match</p>
      </div>

      <div className="filter-row">
        {FILTERS.map(f => (
          <button key={f} className={`filter-btn${filter === f ? ' active' : ''}`}
            onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </div>

      {loading && <div className="spinner" />}

      {!loading && filtered.length === 0 && (
        <div className="empty-state">
          <div className="icon">📅</div>
          <p>No {filter.toLowerCase()} matches found.</p>
        </div>
      )}

      <div className="match-grid">
        {filtered.map(m => <MatchCard key={m.id} match={m} />)}
      </div>
    </div>
  )
}
