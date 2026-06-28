import React, { useState, useEffect, useMemo, useCallback } from 'react';
import GlobeScene from '../components/Globe/GlobeScene.jsx';
import NewsModal from '../components/UI/NewsModal.jsx';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '../components/Globe/NewsMarker.jsx';
import { fetchArticles } from '../utils/api.js';

export default function GlobePage() {
  const [articles, setArticles] = useState([]);
  const [selected, setSelected] = useState(null); // cluster (array) or null
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [panelOpen, setPanelOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchArticles()
      .then(setArticles)
      .catch(err => {
        console.error('Failed to fetch articles:', err);
        setError('Could not reach the news service. Is the backend running?');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Categories actually present, with counts, for the filter bar.
  const categories = useMemo(() => {
    const counts = {};
    for (const a of articles) counts[a.category] = (counts[a.category] || 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [articles]);

  const filteredArticles = useMemo(() => (
    activeCategory === 'all' ? articles : articles.filter(a => a.category === activeCategory)
  ), [articles, activeCategory]);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      {loading && (
        <div className="globe-overlay">
          <div style={{ fontSize: 60, marginBottom: 20, animation: 'spin 3s linear infinite' }}>🌍</div>
          <div style={{ fontFamily: "'Fredoka One', cursive", fontSize: 28, color: '#7EE8A2', marginBottom: 8 }}>
            Good Earth News
          </div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>
            Loading good news from around the world…
          </div>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {!loading && error && (
        <div className="globe-overlay">
          <div style={{ fontSize: 54, marginBottom: 16 }}>🛰️</div>
          <div style={{ fontFamily: "'Fredoka One', cursive", fontSize: 22, color: '#FF6B6B', marginBottom: 10 }}>
            Lost the signal
          </div>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, marginBottom: 20, maxWidth: 320, textAlign: 'center' }}>
            {error}
          </div>
          <button className="btn-retry" onClick={load}>Try again</button>
        </div>
      )}

      {!loading && !error && articles.length === 0 && (
        <div className="globe-overlay">
          <div style={{ fontSize: 54, marginBottom: 16 }}>🌱</div>
          <div style={{ fontFamily: "'Fredoka One', cursive", fontSize: 22, color: '#7EE8A2', marginBottom: 10 }}>
            No stories yet
          </div>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, marginBottom: 20, maxWidth: 340, textAlign: 'center' }}>
            The daily scraper hasn’t found any feel-good stories yet. Check back soon.
          </div>
          <button className="btn-retry" onClick={load}>Refresh</button>
        </div>
      )}

      {!loading && !error && articles.length > 0 && (
        <>
          <GlobeScene
            articles={filteredArticles}
            onOpenArticle={setSelected}
            activeArticle={selected}
          />

          {/* Category filter bar */}
          <div className="filter-bar">
            <button
              className={`filter-chip ${activeCategory === 'all' ? 'active' : ''}`}
              onClick={() => setActiveCategory('all')}
            >
              🌟 All ({articles.length})
            </button>
            {categories.map(([cat, n]) => (
              <button
                key={cat}
                className={`filter-chip ${activeCategory === cat ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat)}
                style={activeCategory === cat
                  ? { background: `${CATEGORY_COLORS[cat]}26`, color: CATEGORY_COLORS[cat], borderColor: `${CATEGORY_COLORS[cat]}80` }
                  : undefined}
              >
                {CATEGORY_ICONS[cat] || '🌍'} {cat} ({n})
              </button>
            ))}
          </div>

          {/* Story list panel toggle */}
          <button className="panel-toggle" onClick={() => setPanelOpen(o => !o)}>
            {panelOpen ? '✕ Close' : '☰ Browse stories'}
          </button>

          {/* Story list panel — click any story to open it from anywhere */}
          <aside className={`story-panel ${panelOpen ? 'open' : ''}`}>
            <div className="story-panel-head">
              {filteredArticles.length} {activeCategory === 'all' ? '' : activeCategory + ' '}stories
            </div>
            <div className="story-panel-list">
              {filteredArticles.map(a => (
                <button
                  key={a.id}
                  className="story-row"
                  onClick={() => { setSelected([a]); setPanelOpen(false); }}
                >
                  <span className="story-row-dot" style={{ background: CATEGORY_COLORS[a.category] || '#7EE8A2' }} />
                  <span className="story-row-text">
                    <span className="story-row-source">{a.source}</span>
                    <span className="story-row-title">{a.title}</span>
                  </span>
                </button>
              ))}
            </div>
          </aside>
        </>
      )}

      {selected && (
        <NewsModal
          articles={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
