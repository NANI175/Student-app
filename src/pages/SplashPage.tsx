import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
function SplashPage() {
  const navigate = useNavigate();
  useEffect(() => {
    const timer = setTimeout(() => {
      navigate('/login');
    }, 4400);
    return () => clearTimeout(timer);
  }, [navigate]);
  return (
    <div className="splash-body">
      {/* Animated background circles */}
      <div className="bg-circle"></div>
      <div className="bg-circle"></div>
      <div className="bg-circle"></div>
      <div className="bg-circle"></div>
      {/* Road decoration */}
      <div className="road-lines"></div>
      {/* Bus running at bottom */}
      <div className="bus-runner">🚌</div>
      {/* Logo */}
      <div className="logo-wrap">
        <div className="college-logo">
          🎓
          <div className="logo-ring"></div>
        </div>
      </div>
      <div className="college-name">Vardhaman College of Engineering</div>
      {/* PathPulse animated letters */}
      <div className="brand-text">
        <span className="brand-letter">P</span>
        <span className="brand-letter">A</span>
        <span className="brand-letter">T</span>
        <span className="brand-letter">H</span>
        <span className="brand-letter" style={{ marginRight: '4px' }}>&nbsp;</span>
        <span className="brand-letter">P</span>
        <span className="brand-letter">U</span>
        <span className="brand-letter">L</span>
        <span className="brand-letter">S</span>
        <span className="brand-letter">E</span>
      </div>
      <div className="tagline">Your bus. Your route. Live.</div>
      <div className="progress-wrap">
        <div className="progress-bar"></div>
      </div>
      <div className="loading-text">LOADING…</div>
    </div>
  );
}
export default SplashPage;
