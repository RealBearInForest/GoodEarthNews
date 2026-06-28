import GlobePage from './pages/GlobePage.jsx';

function Header() {
  return (
    <header style={{
      position: 'fixed', top: 0, left: 0, right: 0,
      zIndex: 1000, display: 'flex', justifyContent: 'center',
      alignItems: 'center', padding: '12px 24px',
      background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(10px)',
      borderBottom: '1px solid rgba(255,255,255,0.1)',
      pointerEvents: 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 28 }}>🌍</span>
        <span style={{
          fontFamily: "'Fredoka One', cursive",
          fontSize: 22, color: '#7EE8A2',
          textShadow: '0 0 20px rgba(126,232,162,0.5)',
        }}>Good Earth News</span>
      </div>
    </header>
  );
}

function Credit() {
  return (
    <div style={{
      position: 'fixed', bottom: 6, right: 12, zIndex: 1000,
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
  return (
    <>
      <Header />
      <GlobePage />
      <Credit />
    </>
  );
}
