/**
 * useApiData — hooks to fetch real data from the Node API
 * Falls back to mock data if the API is not running yet
 */

import { useState, useEffect } from 'react'
import { MOCK_MATCHES } from './useMockData'

const API = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) || 'http://localhost:3001'

async function apiFetch(path: string) {
  const res = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(4000) })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

// ── Live matches hook ─────────────────────────────────────────
export function useLiveMatches() {
  const [matches, setMatches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const data = await apiFetch('/api/live')
        if (!cancelled) {
          setMatches(data.matches || [])
        }
      } catch {
        // API not running yet — use mock live matches
        if (!cancelled) {
          setMatches(MOCK_MATCHES.filter(m => m.is_live).map(adaptMock))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    // Poll every 30 seconds for live updates
    const interval = setInterval(load, 30000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  return { matches, loading }
}

// ── Upcoming / all matches hook ───────────────────────────────
export function useMatches() {
  const [allMatches, setAllMatches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch('/api/matches?status=upcoming')
      .then(d => setAllMatches(d.matches || []))
      .catch(() => setAllMatches(MOCK_MATCHES.map(adaptMock)))
      .finally(() => setLoading(false))
  }, [])

  const liveMatches = allMatches.filter(m => m.is_live || m.status === 'live')
  const upcomingMatches = allMatches.filter(m => m.status === 'upcoming')

  return { allMatches, liveMatches, upcomingMatches, loading }
}

// ── Match detail hook ─────────────────────────────────────────
export function useMatchDetail(id: number | string) {
  const [match, setMatch] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch(`/api/matches/${id}`)
      .then(d => setMatch(d.match || d))
      .catch(() => setMatch(MOCK_MATCHES.find(m => m.id === Number(id)) || null))
      .finally(() => setLoading(false))
  }, [id])

  return { match, loading }
}

// ── Adapt live API match to the UI's expected shape ───────────
function adaptMock(m: any) {
  return {
    ...m,
    team1_short: m.team1_short || m.teams?.[0]?.substring(0, 5).toUpperCase() || 'T1',
    team2_short: m.team2_short || m.teams?.[1]?.substring(0, 5).toUpperCase() || 'T2',
    team1_name:  m.team1_name  || m.teams?.[0] || 'Team 1',
    team2_name:  m.team2_name  || m.teams?.[1] || 'Team 2',
    team1_color: m.team1_color || '#004E92',
    team2_color: m.team2_color || '#EC1C24',
    is_live:     m.is_live || (m.matchStarted && !m.matchEnded),
    status:      m.status === 'upcoming' ? 'upcoming' : m.matchEnded ? 'completed' : 'live',
  }
}
