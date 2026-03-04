import { useState, useEffect } from 'react';
import type React from 'react';
import { useNavigate } from 'react-router-dom';
function LoginPage() {
  const navigate = useNavigate();
  const [studentId, setStudentId] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPw, setShowPw] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<boolean>(false);
  const [btnText, setBtnText] = useState<string>('Sign In →');
  // Handle Enter key globally
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Enter') handleLogin();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  });
  function handleLogin(): void {
    if (loading) return;
    setError(false);
    setLoading(true);
    setTimeout(() => {
      if (studentId.trim() === 'student' && password.trim() === 'student123') {
        setLoading(false);
        setBtnText('✓ Welcome!');
        setTimeout(() => navigate('/home'), 600);
      } else {
        setLoading(false);
        setError(true);
        setBtnText('Sign In →');
      }
    }, 900);
  }
  return (
    <div className="login-page-body">
      {/* Floating bus decorations */}
      <div className="float-bus">🚌</div>
      <div className="float-bus">🚌</div>
      <div className="float-bus">🚌</div>
      <div className="login-wrapper">
        {/* ── LEFT PANEL ── */}
        <div className="left-panel">
          <div className="lp-logo">
            <div className="logo-circle">
              🎓
              <div className="logo-ring-small"></div>
            </div>
            <div className="college-badge">Vardhaman College of Engg.</div>
            <div className="brand-name">
              PATH<span className="pulse-part">PULSE</span>
            </div>
            <div className="brand-sub">Student Transport Portal</div>
          </div>
          <div className="lp-features">
            <div className="feature-item">
              <div className="feature-icon">📍</div>
              <div className="feature-text">
                <div className="ft-title">Live Bus Tracking</div>
                <div className="ft-sub">Real-time GPS location updates</div>
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">⏱️</div>
              <div className="feature-text">
                <div className="ft-title">Accurate ETA</div>
                <div className="ft-sub">Know exactly when your bus arrives</div>
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">🗺️</div>
              <div className="feature-text">
                <div className="ft-title">Route Navigation</div>
                <div className="ft-sub">All stops mapped and listed</div>
              </div>
            </div>
          </div>
          <div className="lp-footer">© 2025 PathPulse · Vardhaman College of Engineering</div>
        </div>
        {/* ── RIGHT PANEL ── */}
        <div className="right-panel">
          <div className="rp-header">
            <div className="rp-badge">
              <div className="dot"></div>System Online
            </div>
            <div className="login-title">Welcome, Student 👋</div>
            <div className="login-sub">Sign in to track your college bus</div>
          </div>
          {/* Student ID field */}
          <div className="form-group">
            <label className="form-label">Student ID / Email</label>
            <div className="input-wrap">
              <span className="input-icon">🎓</span>
              <input
                type="text"
                className="form-input"
                placeholder="student@vardhaman.org"
                autoComplete="off"
                value={studentId}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setStudentId(e.target.value)
                }
              />
            </div>
          </div>
          {/* Password field */}
          <div className="form-group">
            <label className="form-label">Password</label>
            <div className="input-wrap">
              <span className="input-icon">🔒</span>
              <input
                type={showPw ? 'text' : 'password'}
                className="form-input"
                placeholder="Enter your password"
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setPassword(e.target.value)
                }
              />
              <span className="pw-toggle" onClick={() => setShowPw(!showPw)}>
                👁️
              </span>
            </div>
          </div>
          {/* Error message */}
          <div className={`error-msg${error ? ' show' : ''}`}>
            ❌ Invalid credentials. Try: student / student123
          </div>
          {/* Login button */}
          <button
            className="btn-login"
            onClick={handleLogin}
            disabled={loading || btnText === '✓ Welcome!'}
          >
            {loading ? <div className="spinner"></div> : btnText}
          </button>
          <div className="admin-link-wrap">
            <a className="admin-link" href="#">⚙️ Admin Portal</a>
          </div>
          <div className="demo-hint">
            Demo: ID <b>student</b> &nbsp;·&nbsp; Password <b>student123</b>
          </div>
        </div>
      </div>
    </div>
  );
}
export default LoginPage;
