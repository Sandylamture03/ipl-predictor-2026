import { useNavigate, useParams } from 'react-router-dom'
import WinProbabilityBar from '../components/WinProbabilityBar'
import { useMatchDetail } from '../hooks/useApiData'

export default function MatchDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { match, loading } = useMatchDetail(id || '')

  if (loading) {
    return (
      <div className="container">
        <div className="spinner" />
      </div>
    )
  }

  if (!match) {
    return (
      <div className="container">
        <div className="empty-state">
          <div className="icon">Match</div>
          <p>Match not found.</p>
          <button className="filter-btn active" style={{ marginTop: 16 }} onClick={() => navigate('/')}>
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  const prediction = match.prediction || null
  const t1ProbRaw = prediction?.team1_win_prob ?? match.team1_win_prob ?? 0.5
  const t2ProbRaw = prediction?.team2_win_prob ?? match.team2_win_prob ?? 0.5
  const t1Prob = Number(t1ProbRaw)
  const t2Prob = Number(t2ProbRaw)
  const phase = prediction?.phase ?? match.pred_phase
  const isLive = Boolean(match.is_live || String(match.status).toLowerCase() === 'live')

  const date = new Date(match.match_date).toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })

  return (
    <div className="container">
      <div className="page-header">
        <button className="filter-btn" onClick={() => navigate(-1)} style={{ marginBottom: 12 }}>Back</button>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <h1 className="page-title" style={{ fontSize: '2rem' }}>{match.team1_short} vs {match.team2_short}</h1>
          {isLive
            ? <span className="live-badge"><span className="live-dot" />LIVE</span>
            : <span className={`badge badge-${match.status}`}>{match.status}</span>}
        </div>
        <p className="page-subtitle">{date} - {match.venue_name ?? 'TBC'}</p>
      </div>

      {isLive && (
        <div className="score-strip" style={{ marginBottom: 24 }}>
          <div>
            <div className="score-team" style={{ color: match.team1_color }}>{match.team1_short}</div>
            <div className="score-value">{match.score ?? 0}/{match.wickets ?? 0}</div>
            <div className="score-overs">({match.overs ?? 0} ov)</div>
          </div>
          <div className="score-rates">
            <div className="score-rate-value" style={{ color: 'var(--accent-teal)' }}>CRR: {match.current_run_rate ?? '-'}</div>
            <div className="score-rate-label">Current Rate</div>
          </div>
          {match.target && (
            <div style={{ textAlign: 'center' }}>
              <div className="score-rate-value" style={{ color: 'var(--accent-gold)' }}>Target: {match.target}</div>
              <div className="score-rate-label">Need: {Math.max((Number(match.target) - Number(match.score ?? 0)), 0)} runs</div>
            </div>
          )}
          <div className="score-rates">
            <div className="score-rate-value" style={{ color: 'var(--accent-red)' }}>{match.required_run_rate ?? '-'}</div>
            <div className="score-rate-label">Req. Rate</div>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: '28px 32px', marginBottom: 20 }}>
        <div className="match-teams" style={{ gap: 32 }}>
          <div className="team-block">
            <div className="team-badge" style={{ background: match.team1_color, width: 72, height: 72, fontSize: '1.2rem' }}>
              {match.team1_short}
            </div>
            <div className="team-short" style={{ fontSize: '1.4rem' }}>{match.team1_short}</div>
            <div className="team-name">{match.team1_name}</div>
          </div>

          <div style={{ textAlign: 'center', flex: 'none' }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-muted)', fontFamily: 'Rajdhani' }}>VS</div>
            {String(match.status).toLowerCase() === 'completed' && match.winner_name && (
              <div style={{ color: 'var(--accent-teal)', fontSize: '0.85rem', marginTop: 4, fontWeight: 600 }}>
                {match.winner_name} won
              </div>
            )}
          </div>

          <div className="team-block">
            <div className="team-badge" style={{ background: match.team2_color, width: 72, height: 72, fontSize: '1.2rem' }}>
              {match.team2_short}
            </div>
            <div className="team-short" style={{ fontSize: '1.4rem' }}>{match.team2_short}</div>
            <div className="team-name">{match.team2_name}</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: '24px 28px' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: 16, fontWeight: 600 }}>Win Probability</h2>
        <WinProbabilityBar
          team1Name={match.team1_name}
          team2Name={match.team2_name}
          team1Color={match.team1_color}
          team2Color={match.team2_color}
          team1Prob={t1Prob}
          team2Prob={t2Prob}
          phase={phase}
        />
      </div>
    </div>
  )
}