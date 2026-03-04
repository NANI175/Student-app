import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '../firebase';
import busImage from '../assets/bus.png';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
} from 'firebase/firestore';
import type { Stop, BusDoc, RouteDoc } from '../types';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const L: any;
// ── Haversine distance (km) ────────────────────
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
const AVG_SPEED_KMH = 30;
const STOP_GAP = 92;
const PIN_H = 56;   // bus.png height in px — bottom tip aligns to loc.top
const PIN_W = 52;   // bus.png width in px
// ── OSRM road route fetch ──────────────────────
async function fetchRoadRoute(stops: Stop[]): Promise<{ distance: number; coords: [number, number][], legDistances: number[] }> {
  if (stops.length < 2) return { distance: 0, coords: [], legDistances: [] };
  const coordStr = stops.map((s) => `${s.lng},${s.lat}`).join(';');
  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`
    );
    const data = await res.json();
    if (data.code === 'Ok' && data.routes.length > 0) {
      const route = data.routes[0];
      const legDistances = route.legs ? route.legs.map((l: any) => l.distance / 1000) : [];
      const coords: [number, number][] = route.geometry.coordinates.map(
        (c: [number, number]) => [c[1], c[0]]
      );
      return { distance: route.distance / 1000, coords, legDistances };
    }
  } catch (err) {
    console.error('OSRM routing failed:', err);
  }
  const coords: [number, number][] = stops.map((s) => [s.lat, s.lng]);
  const legDistances: number[] = [];
  let dist = 0;
  for (let i = 0; i < stops.length - 1; i++) {
    const d = haversineKm(stops[i], stops[i + 1]);
    dist += d;
    legDistances.push(d);
  }
  return { distance: dist, coords, legDistances };
}
// ── Component ──────────────────────────────────
function TrackingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const busNumberParam = searchParams.get('bus') || searchParams.get('route') || '';
  const studentStop = searchParams.get('start') || '';
  const [viewMode, setViewMode] = useState<'polyline' | 'realtime'>('polyline');
  const [headerTitle, setHeaderTitle] = useState('PathPulse – Live Tracking');
  const [headerSub, setHeaderSub] = useState('Searching for bus…');
  const [busNotFound, setBusNotFound] = useState(false);
  const [connected, setConnected] = useState(false);
  const [routeStops, setRouteStops] = useState<Stop[]>([]);
  const [currentStopName, setCurrentStopName] = useState('—');
  const [speed, setSpeed] = useState<number | null>(null);
  const [eta1Label, setEta1Label] = useState('—');
  const [eta1Time, setEta1Time] = useState('—');
  const [eta2Label, setEta2Label] = useState('—');
  const [eta2Time, setEta2Time] = useState('—');
  const [progress, setProgress] = useState(0);
  const [lastUpdate, setLastUpdate] = useState('Connecting…');
  const [busStatus, setBusStatus] = useState('');
  const [roadDistance, setRoadDistance] = useState<number>(0);
  // Straight-line view state
  const [busLoc, setBusLoc] = useState<{ top: number; index: number; ratio: number } | null>(null);
  const [outsideRoute, setOutsideRoute] = useState(false);
  // Leaflet refs
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstance = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const busMarker = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapLayers = useRef<any[]>([]);
  const routeRef = useRef<Stop[]>([]);
  const legDistancesRef = useRef<number[]>([]);
  const prevBusPos = useRef<{ lat: number; lng: number; time: number } | null>(null);
  const routeColorRef = useRef('#2F3E66');
  // ── Init/destroy Leaflet map on viewMode change ──
  useEffect(() => {
    if (viewMode !== 'realtime') {
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; busMarker.current = null; mapLayers.current = []; }
      return;
    }
    if (!mapRef.current || mapInstance.current) return;
    const timer = setTimeout(() => {
      if (!mapRef.current || mapInstance.current) return;
      const map = L.map(mapRef.current, { center: [17.385, 78.487], zoom: 12, zoomControl: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map);
      L.control.zoom({ position: 'topright' }).addTo(map);
      mapInstance.current = map;
      if (routeRef.current.length > 0) {
        drawRouteOnMap(routeRef.current, routeColorRef.current);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [viewMode]);
  // ── Subscribe to bus ──
  useEffect(() => {
    if (!busNumberParam) { setBusNotFound(true); setHeaderSub('No bus number provided'); return; }
    const busesRef = collection(db, 'buses');
    const busQuery = query(busesRef, where('busNumber', '==', busNumberParam));
    const unsubscribe = onSnapshot(busQuery, async (snapshot) => {
      if (snapshot.empty) { setBusNotFound(true); setHeaderSub(`Bus "${busNumberParam}" not found`); return; }
      setBusNotFound(false);
      const busDocSnap = snapshot.docs[0];
      const bus = { id: busDocSnap.id, ...busDocSnap.data() } as BusDoc;
      setConnected(true);
      setBusStatus(bus.status);
      setLastUpdate('Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      if (bus.assignedRouteId && routeRef.current.length === 0) {
        try {
          const routeSnap = await getDoc(doc(db, 'routes', bus.assignedRouteId));
          if (routeSnap.exists()) {
            const route = { id: routeSnap.id, ...routeSnap.data() } as RouteDoc;
            const stops = [...route.stops].sort((a, b) => a.order - b.order);
            routeRef.current = stops;
            routeColorRef.current = route.routeColor || '#2F3E66';
            setRouteStops(stops);
            setHeaderTitle(route.routeName || `Route ${route.routeNumber}`);
            setHeaderSub(stops[0].name + '  →  ' + stops[stops.length - 1].name);
            const rd = await fetchRoadRoute(stops);
            setRoadDistance(rd.distance);
            legDistancesRef.current = rd.legDistances;
            if (mapInstance.current) {
              drawRouteOnMap(stops, routeColorRef.current);
            }
          }
        } catch (err) { console.error('Failed to load route:', err); }
      }
      if (bus.lastLocation) {
        const pos = { lat: bus.lastLocation.lat, lng: bus.lastLocation.lng };
        computeTracking(pos);
        updateBusOnMap(pos, bus.busNumber);
        locateBusOnStraightLine(pos);
      } else {
        setOutsideRoute(true);
        setBusLoc(null);
      }
    });
    return () => unsubscribe();
  }, [busNumberParam]);
  // ── Draw road-based route on Leaflet map ──
  async function drawRouteOnMap(stops: Stop[], color: string) {
    const map = mapInstance.current;
    if (!map) return;
    mapLayers.current.forEach((l) => map.removeLayer(l));
    mapLayers.current = [];
    const rd = await fetchRoadRoute(stops);
    if (rd.coords.length >= 2) {
      const line = L.polyline(rd.coords, { color, weight: 5, opacity: 0.85 }).addTo(map);
      mapLayers.current.push(line);
    }
    stops.forEach((s, i) => {
      const isFirst = i === 0, isLast = i === stops.length - 1;
      const isStudent = s.name.toLowerCase() === studentStop.toLowerCase();
      const dotColor = isFirst ? '#4CAF82' : isLast ? '#E05252' : isStudent ? '#FF6B00' : color;
      const radius = isFirst || isLast ? 10 : isStudent ? 8 : 6;
      const marker = L.circleMarker([s.lat, s.lng], { radius, fillColor: dotColor, color: '#fff', weight: 2, fillOpacity: 1 }).addTo(map);
      marker.bindTooltip(s.name, { permanent: false, direction: 'top', offset: [0, -8] });
      mapLayers.current.push(marker);
    });
    const pts: [number, number][] = stops.map((s) => [s.lat, s.lng]);
    if (pts.length > 0) map.fitBounds(pts, { padding: [50, 50], maxZoom: 14 });
  }
  function updateBusOnMap(pos: { lat: number; lng: number }, busNumber: string) {
    const map = mapInstance.current;
    if (!map) return;
    const now = Date.now();
    if (prevBusPos.current) {
      const dt = (now - prevBusPos.current.time) / 3600000;
      if (dt > 0) {
        const dist = haversineKm(prevBusPos.current, pos);
        const spd = Math.round(dist / dt);
        if (spd < 200) setSpeed(spd);
      }
    }
    prevBusPos.current = { ...pos, time: now };
    if (busMarker.current) {
      busMarker.current.setLatLng([pos.lat, pos.lng]);
    } else {
      const busIcon = L.icon({ iconUrl: busImage, iconSize: [40, 48], iconAnchor: [20, 48], popupAnchor: [0, -48] });
      busMarker.current = L.marker([pos.lat, pos.lng], { icon: busIcon, zIndexOffset: 1000 }).addTo(map);
      busMarker.current.bindPopup(`<b>🚌 ${busNumber}</b><br/>Live Location`);
    }
  }
  // ── Straight-line bus positioning ──
  function locateBusOnStraightLine(busPos: { lat: number; lng: number }) {
    const stops = routeRef.current;
    if (stops.length < 2) return;
    const TOL = 40;
    for (let i = 0; i < stops.length - 1; i++) {
      const A = stops[i], B = stops[i + 1];
      const dAB = haversineKm(A, B) * 1000;
      const dA = haversineKm(A, busPos) * 1000;
      const dB = haversineKm(busPos, B) * 1000;
      if (dA <= dAB + TOL && dB <= dAB + TOL) {
        const ratio = Math.min(1, Math.max(0, dA / dAB));
        setBusLoc({ top: i * STOP_GAP + ratio * STOP_GAP, index: i, ratio });
        setOutsideRoute(false);
        return;
      }
    }
    setOutsideRoute(true);
    setBusLoc(null);
  }
  function computeTracking(busPos: { lat: number; lng: number }) {
    const stops = routeRef.current;
    if (stops.length < 2) return;
    let minDist = Infinity, nearIdx = 0;
    stops.forEach((s, i) => {
      const d = haversineKm(busPos, { lat: s.lat, lng: s.lng });
      if (d < minDist) { minDist = d; nearIdx = i; }
    });
    setCurrentStopName(stops[nearIdx].name);
    setProgress(Math.min(Math.round((nearIdx / (stops.length - 1)) * 100), 100));
    const legDists = legDistancesRef.current;
    // ETA to Student Stop
    const studentStopIdx = stops.findIndex((s) => s.name.toLowerCase() === studentStop.toLowerCase());
    if (studentStopIdx >= 0 && studentStopIdx > nearIdx) {
      // Sum the actual OSRM road distances for the remaining legs
      let distToStudent = 0;
      for (let i = nearIdx; i < studentStopIdx; i++) {
        distToStudent += legDists[i] || haversineKm(stops[i], stops[i + 1]);
      }
      const etaMins1 = Math.round((distToStudent / AVG_SPEED_KMH) * 60);
      setEta1Label(`${etaMins1} min (${distToStudent.toFixed(1)} km)`);
      setEta1Time(new Date(Date.now() + etaMins1 * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } else if (studentStopIdx >= 0 && studentStopIdx <= nearIdx) {
      setEta1Label('Bus has passed your stop');
      setEta1Time('—');
    } else {
      setEta1Label('Select your stop');
      setEta1Time('—');
    }
    // ETA to Destination
    const lastIdx = stops.length - 1;
    if (nearIdx < lastIdx) {
      let distToEnd = 0;
      for (let i = nearIdx; i < lastIdx; i++) {
        distToEnd += legDists[i] || haversineKm(stops[i], stops[i + 1]);
      }
      const etaMins2 = Math.round((distToEnd / AVG_SPEED_KMH) * 60);
      setEta2Label(`${etaMins2} min (${distToEnd.toFixed(1)} km)`);
      setEta2Time(new Date(Date.now() + etaMins2 * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } else {
      setEta2Label('Arrived');
      setEta2Time('—');
    }
  }
  // Derived values for straight-line view
  const stopCount = routeStops.length;
  const routeHeight = stopCount > 0 ? (stopCount - 1) * STOP_GAP : 0;
  const progressHeight = busLoc ? busLoc.top : 0;
  // ── CONTROL PANEL (always visible) ──
  const controlPanel = (
    <div style={{
      width: 280, background: '#161f2e', borderLeft: '1px solid rgba(255,255,255,0.06)',
      overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0,
    }}>
      {/* View mode toggle */}
      <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
        {(['polyline', 'realtime'] as const).map((m) => (
          <button key={m} onClick={() => setViewMode(m)} style={{
            flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: "'Sora', sans-serif",
            background: viewMode === m ? (m === 'polyline' ? '#4A90D9' : '#4CAF82') : 'transparent',
            color: viewMode === m ? '#fff' : 'rgba(255,255,255,0.5)',
            transition: 'all 0.2s',
          }}>
            {m === 'polyline' ? '📐 Route View' : '🗺️ Live Map'}
          </button>
        ))}
      </div>
      {/* Status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
          background: busStatus === 'Active' ? 'rgba(76,175,130,0.15)' : busStatus === 'Delayed' ? 'rgba(245,166,35,0.15)' : 'rgba(153,153,153,0.15)',
          color: busStatus === 'Active' ? '#4CAF82' : busStatus === 'Delayed' ? '#F5A623' : '#999',
        }}>{busStatus || '—'}</span>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>{lastUpdate}</span>
      </div>
      {/* Current Stop */}
      <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 14 }}>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 600, letterSpacing: 1, marginBottom: 6 }}>📍 CURRENT LOCATION</div>
        <div style={{ color: '#fff', fontSize: 15, fontWeight: 700, fontFamily: "'Sora', sans-serif" }}>{currentStopName}</div>
      </div>
      {/* Speed */}
      <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 14 }}>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 600, letterSpacing: 1, marginBottom: 6 }}>🚀 SPEED</div>
        <div style={{ color: '#fff', fontSize: 22, fontWeight: 700, fontFamily: "'Sora', sans-serif" }}>{speed !== null ? `${speed} km/h` : '— km/h'}</div>
      </div>
      {/* ETA1 */}
      {studentStop && (
        <div style={{ background: 'linear-gradient(135deg, rgba(74,144,217,0.12), rgba(76,175,130,0.08))', borderRadius: 12, padding: 14, border: '1px solid rgba(74,144,217,0.2)' }}>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 600, letterSpacing: 1, marginBottom: 6 }}>⏱️ ETA TO YOUR STOP</div>
          <div style={{ color: '#4A90D9', fontSize: 10, fontWeight: 600, marginBottom: 4 }}>{studentStop}</div>
          <div style={{ color: '#fff', fontSize: 15, fontWeight: 700, fontFamily: "'Sora', sans-serif" }}>{eta1Label}</div>
          {eta1Time !== '—' && <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4 }}>Arrives ≈ {eta1Time}</div>}
        </div>
      )}
      {/* ETA2 */}
      <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 14 }}>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 600, letterSpacing: 1, marginBottom: 6 }}>🏁 ETA TO DESTINATION</div>
        <div style={{ color: '#E05252', fontSize: 10, fontWeight: 600, marginBottom: 4 }}>{routeStops.length > 0 ? routeStops[routeStops.length - 1].name : '—'}</div>
        <div style={{ color: '#fff', fontSize: 15, fontWeight: 700, fontFamily: "'Sora', sans-serif" }}>{eta2Label}</div>
        {eta2Time !== '—' && <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4 }}>Arrives ≈ {eta2Time}</div>}
      </div>
      {/* Progress */}
      <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 14 }}>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 600, letterSpacing: 1, marginBottom: 8 }}>📊 ROUTE PROGRESS</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, #4CAF82, #4A90D9)', borderRadius: 3, transition: 'width 0.5s' }} />
          </div>
          <span style={{ color: '#fff', fontSize: 12, fontWeight: 700, minWidth: 36, textAlign: 'right' }}>{progress}%</span>
        </div>
        {roadDistance > 0 && <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, marginTop: 6 }}>Total road distance: {roadDistance.toFixed(1)} km</div>}
      </div>
    </div>
  );
  return (
    <div className="tracking-page" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#0f1724' }}>
      {/* keyframe for bus pin float animation */}
      <style>{`
        @keyframes busFloat {
          0%, 100% { transform: translateY(0px); filter: drop-shadow(0 4px 6px rgba(0,0,0,0.55)); }
          50%       { transform: translateY(-4px); filter: drop-shadow(0 10px 12px rgba(0,0,0,0.30)); }
        }
        .bus-pin-img { animation: busFloat 2.4s ease-in-out infinite; }
      `}</style>
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', background: '#161f2e', borderBottom: '1px solid rgba(255,255,255,0.06)', gap: 12, flexShrink: 0 }}>
        <button onClick={() => navigate('/home')} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', borderRadius: 10, width: 36, height: 36, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, fontFamily: "'Sora', sans-serif" }}>{headerTitle}</div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{headerSub}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: connected ? 'rgba(76,175,130,0.15)' : 'rgba(255,165,0,0.15)', padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: connected ? '#4CAF82' : '#FFA500', boxShadow: `0 0 6px ${connected ? '#4CAF82' : '#FFA500'}` }} />
          <span style={{ color: connected ? '#4CAF82' : '#FFA500' }}>{connected ? 'LIVE' : 'CONNECTING'}</span>
        </div>
      </div>
      {busNotFound ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#fff', padding: 30, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
          <h3 style={{ margin: '0 0 8px', fontFamily: "'Sora', sans-serif" }}>Bus Not Found</h3>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, maxWidth: 300 }}>
            {busNumberParam ? `No bus "${busNumberParam}" registered.` : 'Search from the home page.'}
          </p>
          <button onClick={() => navigate('/home')} style={{ marginTop: 16, padding: '10px 24px', background: '#4A90D9', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>← Go Back</button>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', overflow: 'auto' }}>
          {/* LEFT: straight-line route view OR Leaflet map */}
          <div style={{
            flex: 1,
            overflow: 'visible',
            position: 'relative',
            //marginTop: 100   // increase if needed (try 40–60)
          }}>
            {viewMode === 'polyline' ? (
              /* ══════════════════════════════════════════════
                 STRAIGHT-LINE ROUTE VIEW  (reference UI)
                 Road:   left=58px, width=12px, dark asphalt
                 Centre: 58+6 = 64px from container left
                 Pin:    left=38px (64-26), width=52, height=56
                 Tip:    top = busLoc.top - PIN_H  (bottom tip = loc.top)
              ══════════════════════════════════════════════ */
              <div style={{
                height: '100%',
                overflowY: 'auto',
                display: 'flex',
                justifyContent: 'center',
                padding: '100px 0 60px',
                background: '#F4F6F8',
              }}>
                {routeStops.length === 0 ? (
                  <div style={{ color: '#5C6F8C', textAlign: 'center', paddingTop: 60, fontFamily: "'Sora', sans-serif", fontSize: 14 }}>
                    Loading route…
                  </div>
                ) : (
                  <div style={{ position: 'relative', width: 340, flexShrink: 0, height: routeHeight + 60 }}>
                    {/* ── Dark asphalt road spine ── */}
                    <div style={{
                      position: 'absolute',
                      left: 58,
                      top: 0,
                      width: 12,
                      height: routeHeight,
                      background: 'linear-gradient(180deg, #2d2d2d, #3a3a3a)',
                      borderRadius: 6,
                    }}>
                      {/* Dashed white centre-lane marking */}
                      <div style={{
                        position: 'absolute',
                        left: 5, top: 0, bottom: 0, width: 2,
                        background: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.13) 0px, rgba(255,255,255,0.13) 10px, transparent 10px, transparent 20px)',
                      }} />
                    </div>
                    {/* ── Green "travelled" progress overlay ── */}
                    <div style={{
                      position: 'absolute',
                      left: 58,
                      top: 0,
                      width: 12,
                      height: progressHeight,
                      background: 'linear-gradient(180deg, #4CAF82, rgba(76,175,130,0.5))',
                      borderRadius: 6,
                      transition: 'height 0.8s cubic-bezier(0.4,0,0.2,1)',
                      zIndex: 2,
                    }} />
                    {/* ── Stop nodes ── */}
                    {routeStops.map((stop, i) => {
                      const isPassed = busLoc !== null && i < busLoc.index;
                      const isCurrent = busLoc !== null && i === busLoc.index + (busLoc.ratio > 0.5 ? 1 : 0);
                      const isFirst = i === 0;
                      const isLast = i === stopCount - 1;
                      const isStudent = stop.name.toLowerCase() === studentStop.toLowerCase();
                      // Circle colour per state
                      const circleBg =
                        isFirst ? '#E05252' :
                          isLast ? '#2F3E66' :
                            isPassed ? '#4CAF82' :
                              isCurrent ? '#ffffff' :
                                isStudent ? '#ffffff' :
                                  '#ffffff';
                      const circleBorder =
                        isFirst ? '3px solid #E05252' :
                          isLast ? '3px solid #2F3E66' :
                            isPassed ? '3px solid #4CAF82' :
                              isCurrent ? '3px solid #4A90D9' :
                                isStudent ? '3px solid #F5A623' :
                                  '3px solid #9ca3af';
                      const circleGlow =
                        isFirst ? '0 2px 8px rgba(224,82,82,0.35)' :
                          isLast ? '0 2px 8px rgba(47,62,102,0.35)' :
                            isPassed ? '0 0 0 4px rgba(76,175,130,0.2)' :
                              isCurrent ? '0 0 0 4px rgba(74,144,217,0.2)' :
                                isStudent ? '0 0 8px rgba(245,158,11,0.25)' :
                                  '0 1px 5px rgba(0,0,0,0.12)';
                      // Label card colour per state
                      const labelBg = isCurrent ? 'rgba(74,144,217,0.06)' : '#ffffff';
                      const labelColor = isPassed ? '#5C6F8C' : '#2F3E66';
                      const labelFontWeight = isCurrent || isFirst || isLast ? 700 : 500;
                      const labelBorderLeft =
                        isPassed ? '3px solid #4CAF82' :
                          isCurrent ? '3px solid #4A90D9' :
                            isStudent ? '3px solid #F5A623' :
                              '3px solid #dce3ef';
                      return (
                        <div
                          key={stop.order}
                          style={{
                            position: 'absolute',
                            left: 58,
                            top: i * STOP_GAP - 10,
                            display: 'flex',
                            alignItems: 'center',
                            zIndex: 3,
                          }}
                        >
                          {/* Circle dot */}
                          <div style={{
                            width: 22,
                            height: 22,
                            borderRadius: '50%',
                            background: circleBg,
                            border: circleBorder,
                            boxShadow: circleGlow,
                            transform: 'translateX(-5px)',
                            flexShrink: 0,
                            position: 'relative',
                            zIndex: 4,
                            transition: 'background 0.4s, border-color 0.4s',
                          }} />
                          {/* Label card */}
                          <div style={{
                            marginLeft: 16,
                            background: labelBg,
                            padding: '7px 12px',
                            borderRadius: 10,
                            fontSize: 13,
                            color: labelColor,
                            fontWeight: labelFontWeight,
                            fontFamily: "'DM Sans', sans-serif",
                            whiteSpace: 'nowrap',
                            boxShadow: '0 2px 8px rgba(47,62,102,0.10)',
                            borderLeft: labelBorderLeft,
                            transition: 'border-left-color 0.4s',
                          }}>
                            {stop.name}
                            {/* State badges */}
                            {isCurrent && !isFirst && !isLast && (
                              <span style={{ display: 'inline-flex', background: '#4A90D9', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, marginLeft: 6 }}>Next</span>
                            )}
                            {isFirst && (
                              <span style={{ display: 'inline-flex', background: '#E05252', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, marginLeft: 6 }}>Start</span>
                            )}
                            {isLast && (
                              <span style={{ display: 'inline-flex', background: '#2F3E66', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, marginLeft: 6 }}>End</span>
                            )}
                            {isStudent && !isCurrent && !isFirst && !isLast && (
                              <span style={{ display: 'inline-flex', background: '#F5A623', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, marginLeft: 6 }}>My Stop</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {/* ── Bus pin image ──
                        left = 38px  → centres 52px pin on 64px road-centre
                        top  = busLoc.top - PIN_H  → bottom tip of image = exact bus position
                        Hidden above viewport (top: -PIN_H) until Firebase sends location */}
                    <img
                      src={busImage}
                      alt="Bus"
                      className="bus-pin-img"
                      style={{
                        position: 'absolute',
                        left: 38,
                        top: busLoc ? busLoc.top - PIN_H : -PIN_H,
                        width: PIN_W,
                        height: PIN_H,
                        objectFit: 'contain',
                        pointerEvents: 'none',
                        zIndex: 6,
                        transition: 'top 0.8s cubic-bezier(0.4,0,0.2,1)',
                      }}
                    />
                    {/* Outside route warning */}
                    {outsideRoute && connected && (
                      <div style={{
                        position: 'absolute',
                        top: routeHeight + 20,
                        left: 0, right: 0,
                        color: '#F5A623',
                        textAlign: 'center',
                        fontSize: 13,
                        fontWeight: 600,
                      }}>
                        ⚠️ Bus is outside route area
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* ─── LEAFLET MAP VIEW (unchanged) ─── */
              <div
                ref={mapRef}
                style={{
                  width: '100%',
                  height: '100%'
                }}
              />
            )}
          </div>
          {/* RIGHT: Control panel (always visible, unchanged) */}
          {controlPanel}
        </div>
      )}
    </div>
  );
}
export default TrackingPage;
