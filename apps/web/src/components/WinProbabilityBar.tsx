interface WinProbabilityBarProps {
  team1Name: string
  team2Name: string
  team1Color: string
  team2Color: string
  team1Prob: number  // 0–1
  team2Prob: number
  phase?: string
}

export default function WinProbabilityBar({
  team1Name, team2Name, team1Color, team2Color, team1Prob, team2Prob, phase
}: WinProbabilityBarProps) {
  const t1Pct = Math.round(team1Prob * 100)
  const t2Pct = Math.round(team2Prob * 100)

  return (
    <div className="prob-bar-container">
      {phase && (
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase',
          letterSpacing: '0.08em', marginBottom: 6 }}>
          {phase.replace('_', ' ')} prediction
        </div>
      )}
      <div className="prob-bar-labels">
        <span style={{ color: team1Color || 'var(--accent-blue)' }}>{t1Pct}% {team1Name}</span>
        <span style={{ color: team2Color || 'var(--accent-red)' }}>{team2Name} {t2Pct}%</span>
      </div>
      <div className="prob-bar-track">
        <div
          className="prob-bar-fill"
          style={{
            width: `${t1Pct}%`,
            background: `linear-gradient(90deg, ${team1Color || 'var(--accent-blue)'}, ${team2Color || 'var(--accent-red)'})`,
          }}
        />
      </div>
    </div>
  )
}
