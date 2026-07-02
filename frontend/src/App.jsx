import { useState } from 'react';
import GlobePage from './pages/GlobePage.jsx';
import AboutModal from './components/UI/AboutModal.jsx';

function Header({ onAbout }) {
  return (
    <header style={{
      position: 'fixed', top: 0, left: 0, right: 0,
      zIndex: 1000, display: 'flex', justifyContent: 'space-between',
      alignItems: 'center',
      padding: 'calc(10px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) 10px calc(16px + env(safe-area-inset-left))',
      background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(10px)',
      borderBottom: '1px solid rgba(255,255,255,0.1)',
      pointerEvents: 'none',
    }}>
      {/* left spacer keeps the title visually centered */}
      <span style={{ width: 64 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 28 }}>🌍</span>
        <span style={{
          fontFamily: "'Fredoka One', cursive",
          fontSize: 22, color: '#7EE8A2',
          textShadow: '0 0 20px rgba(126,232,162,0.5)',
        }}>Good Earth News</span>
      </div>
      <button className="about-button" onClick={onAbout} style={{ pointerEvents: 'auto' }}>
        ✨ About
      </button>
    </header>
  );
}

function Credit() {
  return (
    <div style={{
      position: 'fixed',
      bottom: 'calc(6px + env(safe-area-inset-bottom))',
      right: 'calc(12px + env(safe-area-inset-right))',
      zIndex: 1000,
      fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
      color: 'rgba(255,255,255,0.45)',
      textShadow: '0 1px 4px rgba(0,0,0,0.6)',
      pointerEvents: 'none', userSelect: 'none',
    }}>
      Created by Jason and Sabrina
    </div>
  );
}

export default function App() {
  const [aboutOpen, setAboutOpen] = useState(false);
  return (
    <>
      <Header onAbout={() => setAboutOpen(true)} />
      <GlobePage />
      <Credit />
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
    </>
  );
}
