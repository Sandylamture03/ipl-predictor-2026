import { NavLink } from 'react-router-dom'

export default function Navbar() {
  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <NavLink to="/" className="navbar-logo">
          <span className="logo-icon">🏏</span>
          <span>IPL <span className="logo-accent">2026</span> Predictor</span>
        </NavLink>
        <div className="navbar-nav">
          <NavLink to="/" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} end>
            Dashboard
          </NavLink>
          <NavLink to="/upcoming" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            Upcoming
          </NavLink>
          <NavLink to="/history" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            History
          </NavLink>
        </div>
      </div>
    </nav>
  )
}
