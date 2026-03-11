import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import WinProbabilityBar from '../components/WinProbabilityBar'
import { MOCK_MATCHES } from '../hooks/useMockData'

export default function MatchDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [liveProb, setLiveProb] = useState({ t1: 0.5, t2: 0.5 })

  // Find match from mock data (replace with API fetch when backend is live)
  const match = MOCK_MATCHES.find(m => m.id === Number(id))

  // Simulate live probability drift
  useEffect(() => {
    if (!match?.is_live) return
    const interval = setInterval(() => {
      setLiveProb(prev => {
        const drift = (Math.random() - 0.5) * 0.04
        const t1 = Math.min(Math.max(prev.t1 + drift, 0.1), 0.9)
        return { t1, t2: 1 - t1 }
      })
    }, 3000)
    return () => clearInterval(interval)
  }, [match?.is_live])

  if (!match) return (
    <div className="container">
      <div className="empty-state">
        <div className="icon">🏏</div>
        <p>Match not found.</p>
        <button className="filter-btn active" style={{marginTop:16}} onClick={() => navigate('/')}>
          ← Back to Dashboard
        </button>
      </div>
    </div>
  )

  const t1Prob = match.is_live ? liveProb.t1 : (match.team1_win_prob ?? 0.5)
  const t2Prob = match.is_live ? liveProb.t2 : (match.team2_win_prob ?? 0.5)
  const date = new Date(match.match_date).toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })

  return (
    <div className="container">
      {/* Header */}
      <div className="page-header">
        <button className="filter-btn" onClick={() => navigate(-1)} style={{marginBottom:12}}>← Back</button>
        <div style={{display:'flex', gap:12, alignItems:'center', flexWrap:'wrap'}}>
          <h1 className="page-title" style={{fontSize:'2rem'}}>{match.team1_short} vs {match.team2_short}</h1>
          {match.is_live
            ? <span className="live-badge"><span className="live-dot"/>LIVE</span>
            : <span className={`badge badge-${match.status}`}>{match.status}</span>}
        </div>
        <p className="page-subtitle">{date} · {match.venue_name ?? 'TBC'}</p>
      </div>

      {/* Score strip (if live) */}
      {match.is_live && (
        <div className="score-strip" style={{marginBottom:24}}>
          <div>
            <div className="score-team" style={{color: match.team1_color}}>{match.team1_short}</div>
            <div className="score-value">{match.score ?? '—'}/{match.wickets ?? 0}</div>
            <div className="score-overs">({match.overs ?? 0} ov)</div>
          </div>
          <div className="score-rates">
            <div className="score-rate-value" style={{color:'var(--accent-teal)'}}>CRR: {match.crr ?? '—'}</div>
            <div className="score-rate-label">Current Rate</div>
          </div>
          {match.target && (
            <div style={{textAlign:'center'}}>
              <div className="score-rate-value" style={{color:'var(--accent-gold)'}}>Target: {match.target}</div>
              <div className="score-rate-label">Need: {Math.max((match.target - (match.runs_scored ?? 0)), 0)} runs</div>
            </div>
          )}
          <div className="score-rates">
            <div className="score-rate-value" style={{color:'var(--accent-red)'}}>{match.rrr ?? '—'}</div>
            <div className="score-rate-label">Req. Rate</div>
          </div>
        </div>
      )}

      {/* Teams */}
      <div className="card" style={{padding:'28px 32px', marginBottom:20}}>
        <div className="match-teams" style={{gap:32}}>
          <div className="team-block">
            <div className="team-badge" style={{background: match.team1_color, width:72, height:72, fontSize:'1.2rem'}}>
              {match.team1_short}
            </div>
            <div className="team-short" style={{fontSize:'1.4rem'}}>{match.team1_short}</div>
            <div className="team-name">{match.team1_name}</div>
          </div>
          <div style={{textAlign:'center', flex:'none'}}>
            <div style={{fontSize:'2rem', fontWeight:800, color:'var(--text-muted)', fontFamily:'Rajdhani'}}>VS</div>
            {match.status === 'completed' && <div style={{color:'var(--accent-teal)', fontSize:'0.85rem', marginTop:4, fontWeight:600}}>{match.winner_name} won</div>}
          </div>
          <div className="team-block">
            <div className="team-badge" style={{background: match.team2_color, width:72, height:72, fontSize:'1.2rem'}}>
              {match.team2_short}
            </div>
            <div className="team-short" style={{fontSize:'1.4rem'}}>{match.team2_short}</div>
            <div className="team-name">{match.team2_name}</div>
          </div>
        </div>
      </div>

      {/* Win Probability */}
      <div className="card" style={{padding:'24px 28px', marginBottom:20}}>
        <h2 style={{fontSize:'1.1rem', marginBottom:16, fontWeight:600}}>
          {match.is_live ? '⚡ Live Win Probability' : '🤖 AI Win Prediction'}
        </h2>
        <WinProbabilityBar
          team1Name={match.team1_name}
          team2Name={match.team2_name}
          team1Color={match.team1_color}
          team2Color={match.team2_color}
          team1Prob={t1Prob}
          team2Prob={t2Prob}
          phase={match.pred_phase}
        />
        {match.is_live && (
          <p style={{marginTop:12, fontSize:'0.78rem', color:'var(--text-muted)'}}>
            Updates every 3 seconds · Based on score, wickets, required run rate
          </p>
        )}
      </div>

      {/* Key Factors */}
      <div className="card" style={{padding:'24px 28px'}}>
        <h2 style={{fontSize:'1.1rem', marginBottom:16, fontWeight:600}}>🔍 Key Prediction Factors</h2>
        <PredictionFactor label="Team Form (Last 5)" team1Val={72} team2Val={58} />
        <PredictionFactor label="Venue Advantage" team1Val={61} team2Val={55} />
        <PredictionFactor label="Head-to-Head" team1Val={55} team2Val={45} />
        <PredictionFactor label="ELO Rating Diff" team1Val={68} team2Val={52} />
        <p style={{marginTop:16, fontSize:'0.75rem', color:'var(--text-muted)'}}>
          Powered by XGBoost model trained on Cricsheet IPL data 2008–2025.
          Train the model to see real predictions: <code style={{color:'var(--accent-blue)'}}>python -m src.training.train_pre_match</code>
        </p>
      </div>
    </div>
  )
}

function PredictionFactor({ label, team1Val, team2Val }: { label: string; team1Val: number; team2Val: number }) {
  return (
    <div className="explanation-row" style={{marginBottom:12}}>
      <span className="explanation-label" style={{minWidth:160}}>{label}</span>
      <div style={{flex:1, display:'flex', alignItems:'center', gap:8}}>
        <div style={{flex:1}}>
          <div className="explanation-bar">
            <div className="explanation-bar-fill" style={{width:`${team1Val}%`}} />
          </div>
        </div>
        <span style={{width:32, textAlign:'right', fontWeight:600, fontSize:'0.82rem'}}>{team1Val}</span>
        <span style={{width:12, textAlign:'center', color:'var(--text-muted)'}}>:</span>
        <span style={{width:32, fontWeight:600, fontSize:'0.82rem'}}>{team2Val}</span>
        <div style={{flex:1}}>
          <div className="explanation-bar">
            <div className="explanation-bar-fill" style={{width:`${team2Val}%`, background:'linear-gradient(90deg, var(--accent-red), var(--accent-purple))'}} />
          </div>
        </div>
      </div>
    </div>
  )
}
