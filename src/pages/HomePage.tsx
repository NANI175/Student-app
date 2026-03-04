import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import type { RouteDoc, Stop } from '../types';
// ── Component ──────────────────────────────────────
function HomePage(): JSX.Element {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'route' | 'station'>('route');
  const [routeInput, setRouteInput] = useState<string>('');
  const [startStation, setStartStation] = useState<string>('');
  const [endStation, setEndStation] = useState<string>('');
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [activeBusCount, setActiveBusCount] = useState<string | number>('—');
  const [routeCount, setRouteCount] = useState<string | number>('—');
  const [stations, setStations] = useState<string[]>([]);
  const [popularRoutes, setPopularRoutes] = useState<{ num: string; name: string }[]>([]);
  const menuBtnRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  // Fetch live stats and route data from Firestore
  useEffect(() => {
    async function loadData() {
      try {
        // Active buses count + bus-to-route mapping
        const busSnap = await getDocs(collection(db, 'buses'));
        setActiveBusCount(busSnap.size);
        // Build map: routeId → busNumber[]
        const routeBusMap: Record<string, string[]> = {};
        busSnap.docs.forEach((d) => {
          const data = d.data();
          if (data.assignedRouteId) {
            if (!routeBusMap[data.assignedRouteId]) routeBusMap[data.assignedRouteId] = [];
            routeBusMap[data.assignedRouteId].push(data.busNumber || d.id);
          }
        });
        // Routes + extract stations + popular routes
        const routeSnap = await getDocs(collection(db, 'routes'));
        setRouteCount(routeSnap.size);
        const allStops = new Set<string>();
        const routeCards: { num: string; name: string; busNumbers: string[]; routeId: string }[] = [];
        routeSnap.docs.forEach((d) => {
          const r = d.data() as Omit<RouteDoc, 'id'>;
          const stops = r.stops || [];
          stops.forEach((s: Stop) => allStops.add(s.name));
          if (stops.length >= 2) {
            routeCards.push({
              num: r.routeNumber,
              name: `${stops[0].name} → ${stops[stops.length - 1].name}`,
              busNumbers: routeBusMap[d.id] || [],
              routeId: d.id,
            });
          }
        });
        setStations(Array.from(allStops).sort());
        setPopularRoutes(routeCards.slice(0, 4)); // Show first 4 routes
      } catch (err) {
        console.error('Failed to load data from Firestore:', err);
        setActiveBusCount('—');
        setRouteCount('—');
      }
    }
    loadData();
  }, []);
  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent): void {
      const target = e.target as Node;
      if (
        menuBtnRef.current &&
        !menuBtnRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);
  function goByRoute(): void {
    const r = routeInput.trim();
    if (!r) { alert('Please enter a bus number'); return; }
    navigate(`/tracking?bus=${encodeURIComponent(r)}`);
  }
  function goByStations(): void {
    if (!startStation || !endStation) { alert('Please select both stations'); return; }
    if (startStation === endStation) { alert('Start and end stations cannot be the same'); return; }
    navigate(
      `/tracking?start=${encodeURIComponent(startStation)}&end=${encodeURIComponent(endStation)}`
    );
  }
  function swapStations(): void {
    const prev = startStation;
    setStartStation(endStation);
    setEndStation(prev);
  }
  return (
    <div className="home-body">
      {/* ── HEADER ── */}
      <div className="header">
        <div className="header-inner">
          <div className="header-brand">
            <div className="header-logo">🎓</div>
            <div className="header-title">PATH<span>PULSE</span></div>
          </div>
          <div className="header-right">
            <div
              className="menu-btn"
              ref={menuBtnRef}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <span></span><span></span><span></span>
            </div>
          </div>
        </div>
      </div>
      {/* ── DROPDOWN MENU ── */}
      <div className={`dropdown${menuOpen ? ' open' : ''}`} ref={dropdownRef}>
        <button className="dropdown-item" onClick={() => { setMenuOpen(false); navigate('/home'); }}>
          🏠 Home
        </button>
        <button className="dropdown-item danger" onClick={() => navigate('/login')}>
          ⏻ Logout
        </button>
      </div>
      {/* ── HERO ── */}
      <div className="hero">
        <div className="hero-inner">
          <div className="hero-greeting">Good morning, Student 👋</div>
          <div className="hero-title">Where is your bus today?</div>
          <div className="live-chips">
            <div className="live-chip">
              <div className="live-dot"></div>Live Tracking Active
            </div>
            <div className="live-chip">🚌 {activeBusCount} Buses Running</div>
          </div>
        </div>
      </div>
      {/* ── MAIN CONTENT ── */}
      <div className="main-content">
        {/* SEARCH CARD */}
        <div className="search-card">
          <div className="card-tabs">
            <button
              className={`card-tab${activeTab === 'route' ? ' active' : ''}`}
              onClick={() => setActiveTab('route')}
            >
              🔢 By Bus No.
            </button>
            <button
              className={`card-tab${activeTab === 'station' ? ' active' : ''}`}
              onClick={() => setActiveTab('station')}
            >
              📍 By Stations
            </button>
          </div>
          {/* Bus Number Tab */}
          <div className={`tab-panel${activeTab === 'route' ? ' active' : ''}`}>
            <div className="route-input-wrap">
              <div className="route-input-box">
                <span className="icon">🔢</span>
                <input
                  type="text"
                  className="styled-input"
                  placeholder="Enter bus number (e.g. Bus 07)"
                  autoComplete="off"
                  value={routeInput}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setRouteInput(e.target.value)
                  }
                  onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === 'Enter') goByRoute();
                  }}
                />
              </div>
              <button className="track-btn" onClick={goByRoute}>Track →</button>
            </div>
          </div>
          {/* Station Tab */}
          <div className={`tab-panel${activeTab === 'station' ? ' active' : ''}`}>
            <div className="station-fields">
              <div className="station-field">
                <span style={{
                  position: 'absolute', left: 13, top: '50%',
                  transform: 'translateY(-50%)', fontSize: 15,
                  color: 'var(--success)', pointerEvents: 'none'
                }}>🟢</span>
                <select
                  className="styled-select"
                  value={startStation}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setStartStation(e.target.value)
                  }
                >
                  <option value="">From — Start Station</option>
                  {stations.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="swap-btn" onClick={swapStations} title="Swap">⇅</div>
              <div className="station-field">
                <span style={{
                  position: 'absolute', left: 13, top: '50%',
                  transform: 'translateY(-50%)', fontSize: 15,
                  color: 'var(--danger)', pointerEvents: 'none'
                }}>🔴</span>
                <select
                  className="styled-select"
                  value={endStation}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setEndStation(e.target.value)
                  }
                >
                  <option value="">To — End Station</option>
                  {stations.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <button className="find-btn" onClick={goByStations}>Find My Route →</button>
          </div>
        </div>
        {/* POPULAR ROUTES (from Firestore) */}
        {popularRoutes.length > 0 && (
          <>
            <div className="section-header">
              <div className="section-title">Available Routes</div>
            </div>
            <div className="routes-grid">
              {popularRoutes.map((r) => (
                <div
                  key={r.num}
                  className="route-card"
                  onClick={() => {
                    const busNum = r.busNumbers.length > 0 ? r.busNumbers[0] : r.num;
                    navigate(`/tracking?bus=${encodeURIComponent(busNum)}`);
                  }}
                >
                  <div className="rc-number">
                    {r.busNumbers.length > 0 ? r.busNumbers[0] : r.num}
                  </div>
                  <div className="rc-name">{r.name}</div>
                  {r.busNumbers.length > 1 && (
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>
                      +{r.busNumbers.length - 1} more bus{r.busNumbers.length > 2 ? 'es' : ''}
                    </div>
                  )}
                  <div className="rc-footer">
                    <div className="rc-status">
                      <div className="sdot"></div>Live
                    </div>
                    <div className="rc-arrow">→</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {/* INFO CARDS */}
        <div className="info-cards">
          <div className="info-card">
            <div className="ic-icon">🚌</div>
            <div className="ic-val">{activeBusCount}</div>
            <div className="ic-label">Buses Active Now</div>
          </div>
          <div className="info-card">
            <div className="ic-icon">🗺️</div>
            <div className="ic-val">{routeCount}</div>
            <div className="ic-label">Routes Running</div>
          </div>
        </div>
      </div>
    </div>
  );
}
export default HomePage;
