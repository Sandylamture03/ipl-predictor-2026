import { useNavigate } from 'react-router-dom'
import WinProbabilityBar from './WinProbabilityBar'

interface Match {
  id: number
  match_date: string
  match_number?: number
  stage?: string
  status: string
  team1_name: string; team1_short: string; team1_color: string
  team2_name: string; team2_short: string; team2_color: string
  venue_name?: string; venue_city?: string
  team1_win_prob?: number; team2_win_prob?: number; pred_phase?: string
  score?: string; wickets?: number; overs?: number; target?: number
  is_live?: boolean; winner_name?: string
}

export default function MatchCard({ match }: { match: Match }) {
  const navigate = useNavigate()
  const date = new Date(match.match_date).toLocaleDateString('en-IN', {
    weekday: 'short', month: 'short', day: 'numeric'
  })

  return (
    <div className="card match-card" onClick={() => navigate(`/match/${match.id}`)}>
      <div className="match-card-header">
        <span className="match-meta">
          {match.match_number ? `Match ${match.match_number} · ` : ''}{date}
          {match.venue_city ? ` · ${match.venue_city}` : ''}
        </span>
        {match.is_live ? (
          <span className="live-badge"><span className="live-dot" />LIVE</span>
        ) : (
          <span className={`badge badge-${match.status}`}>{match.status}</span>
        )}
      </div>

      <div className="match-teams">
        <div className="team-block">
          <div className="team-badge" style={{ background: match.team1_color }}>
            {match.team1_short}
          </div>
          <div className="team-short">{match.team1_short}</div>
          <div className="team-name">{match.team1_name}</div>
          {match.is_live && match.score && (
            <div className="match-score-display">{match.score}/{match.wickets} <span style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>({match.overs} ov)</span></div>
          )}
        </div>

        <div style={{ textAlign: 'center' }}>
          <div className="match-vs">VS</div>
          {match.status === 'completed' && match.winner_name && (
            <div style={{ fontSize: '0.7rem', color: 'var(--accent-teal)', fontWeight: 600, marginTop: 4 }}>
              {match.winner_name} won
            </div>
          )}
        </div>

        <div className="team-block">
          <div className="team-badge" style={{ background: match.team2_color }}>
            {match.team2_short}
          </div>
          <div className="team-short">{match.team2_short}</div>
          <div className="team-name">{match.team2_name}</div>
          {match.is_live && match.target && (
            <div className="match-score-display" style={{color:'var(--text-secondary)'}}>Target: {match.target}</div>
          )}
        </div>
      </div>

      {(match.team1_win_prob !== undefined && match.team2_win_prob !== undefined) && (
        <WinProbabilityBar
          team1Name={match.team1_short}
          team2Name={match.team2_short}
          team1Color={match.team1_color}
          team2Color={match.team2_color}
          team1Prob={match.team1_win_prob}
          team2Prob={match.team2_win_prob}
          phase={match.pred_phase}
        />
      )}
    </div>
  )
}
