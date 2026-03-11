import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Dashboard from './pages/Dashboard'
import UpcomingMatches from './pages/UpcomingMatches'
import MatchDetail from './pages/MatchDetail'
import PastExplorer from './pages/PastExplorer'

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/upcoming" element={<UpcomingMatches />} />
          <Route path="/match/:id" element={<MatchDetail />} />
          <Route path="/history" element={<PastExplorer />} />
        </Routes>
      </main>
      <footer className="footer">
        🏏 IPL 2026 Win Predictor · AI-powered predictions · Not for wagering · Data via Cricsheet &amp; official IPL
      </footer>
    </BrowserRouter>
  )
}
