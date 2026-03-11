/**
 * Mock data hook — provides realistic IPL 2026 sample matches
 * so the UI is fully functional before the backend/DB is running.
 * Replace with real API calls by swapping useMockMatches() → useApiMatches()
 */

export const MOCK_MATCHES = [
  {
    id: 1, season: '2026', match_date: '2026-03-28', match_number: 1,
    status: 'upcoming', stage: 'league',
    team1_name: 'Royal Challengers Bengaluru', team1_short: 'RCB', team1_color: '#EC1C24',
    team2_name: 'Punjab Kings',               team2_short: 'PBKS', team2_color: '#ED1B24',
    venue_name: 'M. Chinnaswamy Stadium', venue_city: 'Bengaluru',
    team1_win_prob: 0.58, team2_win_prob: 0.42, pred_phase: 'pre_match',
    is_live: false, winner_name: undefined,
  },
  {
    id: 2, season: '2026', match_date: '2026-03-29', match_number: 2,
    status: 'upcoming', stage: 'league',
    team1_name: 'Chennai Super Kings', team1_short: 'CSK', team1_color: '#F9CD1B',
    team2_name: 'Mumbai Indians',      team2_short: 'MI',  team2_color: '#004E92',
    venue_name: 'MA Chidambaram Stadium', venue_city: 'Chennai',
    team1_win_prob: 0.52, team2_win_prob: 0.48, pred_phase: 'pre_match',
    is_live: false, winner_name: undefined,
  },
  {
    id: 3, season: '2026', match_date: '2026-03-10', match_number: 0,
    status: 'live', stage: 'league',
    team1_name: 'Kolkata Knight Riders', team1_short: 'KKR', team1_color: '#3A225D',
    team2_name: 'Gujarat Titans',        team2_short: 'GT',  team2_color: '#1C2B5E',
    venue_name: 'Eden Gardens', venue_city: 'Kolkata',
    team1_win_prob: 0.63, team2_win_prob: 0.37, pred_phase: 'live',
    is_live: true,
    score: '142', wickets: 4, overs: 16.3, target: 181,
    crr: '8.61', rrr: '11.08', runs_scored: 142,
    winner_name: undefined,
  },
  {
    id: 4, season: '2025', match_date: '2025-05-25', match_number: 74,
    status: 'completed', stage: 'final',
    team1_name: 'Kolkata Knight Riders',  team1_short: 'KKR', team1_color: '#3A225D',
    team2_name: 'Sunrisers Hyderabad', team2_short: 'SRH',   team2_color: '#FF6B2B',
    venue_name: 'Narendra Modi Stadium', venue_city: 'Ahmedabad',
    team1_win_prob: 0.61, team2_win_prob: 0.39, pred_phase: 'pre_match',
    is_live: false, winner_name: 'Kolkata Knight Riders',
  },
  {
    id: 5, season: '2026', match_date: '2026-03-30', match_number: 3,
    status: 'upcoming', stage: 'league',
    team1_name: 'Rajasthan Royals',  team1_short: 'RR',   team1_color: '#FF1493',
    team2_name: 'Delhi Capitals',    team2_short: 'DC',   team2_color: '#17479E',
    venue_name: 'Sawai Mansingh Stadium', venue_city: 'Jaipur',
    team1_win_prob: 0.55, team2_win_prob: 0.45, pred_phase: 'pre_match',
    is_live: false, winner_name: undefined,
  },
  {
    id: 6, season: '2026', match_date: '2026-04-01', match_number: 4,
    status: 'upcoming', stage: 'league',
    team1_name: 'Sunrisers Hyderabad',   team1_short: 'SRH',  team1_color: '#FF6B2B',
    team2_name: 'Lucknow Super Giants',  team2_short: 'LSG',  team2_color: '#A72056',
    venue_name: 'Rajiv Gandhi Stadium', venue_city: 'Hyderabad',
    team1_win_prob: 0.49, team2_win_prob: 0.51, pred_phase: 'pre_match',
    is_live: false, winner_name: undefined,
  },
]

export function useMockMatches() {
  const liveMatches = MOCK_MATCHES.filter(m => m.is_live)
  const upcomingMatches = MOCK_MATCHES.filter(m => m.status === 'upcoming')
  const allMatches = MOCK_MATCHES

  return { liveMatches, upcomingMatches, allMatches, loading: false }
}
