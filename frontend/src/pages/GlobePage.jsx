import React, { useState, useEffect, useMemo, useCallback } from 'react';
import GlobeScene from '../components/Globe/GlobeScene.jsx';
import NewsModal from '../components/UI/NewsModal.jsx';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '../components/Globe/NewsMarker.jsx';
import { fetchArticles, fetchArticle } from '../utils/api.js';
import { supportsWebGL } from '../utils/quality.js';
import { timeAgo, isNew } from '../utils/dates.js';
import { track } from '../utils/track.js';

const WEBGL_OK = typeof window !== 'undefined' && supportsWebGL();

// Catches WebGL/three.js runtime crashes and swaps in the non-3D story list, so
// a GPU hiccup never takes down the whole site.
class GlobeErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err) { console.error('3D globe crashed, falling back to list:', err); }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

// Non-3D fallback: friendly message + the plain story list.
function StoryListFallback({ articles, onOpen }) {
  return (
    <div className="fallback-page">
      <div className="fallback-note">
        🌍 Your browser can&apos;t show the 3D globe, but the good news still works —
        here are today&apos;s stories:
      </div>
      <div className="fallback-list">
        {articles.map(a => (
          <button key={a.id} className="story-row" onClick={() => onOpen([a])}>
            <span className="story-row-dot" style={{ background: CATEGORY_COLORS[a.category] || '#7EE8A2' }} />
            <span className="story-row-text">
              <span className="story-row-source">
                {a.source}{a.published_at ? ` · ${timeAgo(a.published_at)}` : ''}
              </span>
              <span className="story-row-title">{a.title}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function GlobePage() {
  const [articles, setArticles] = useState([]);
  const [selected, setSelected] = useState(null); // cluster (array) or null
  const [flyTo, setFlyTo] = useState(null);       // article the autopilot is flying to
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [panelOpen, setPanelOpen] = useState(false);
  // Deep-link param captured ONCE at mount — before the URL-sync effect below is
  // allowed to rewrite the URL (otherwise it would strip ?story before we read it).
  const [pendingStoryId, setPendingStoryId] = useState(
    () => new URLSearchParams(window.location.search).get('story'),
  );

  // Opening a story by hand (marker tap, E key, fallback list) cancels any
  // in-progress autopilot so arrival can't stomp the modal the user just opened.
  const openStory = useCallback((cluster) => {
    setFlyTo(null);
    setSelected(cluster);
    if (cluster?.[0]) track('story_opened', { article: cluster[0], meta: { via: 'direct' } });
  }, []);

  // One anonymous session marker per visit (feeds the analytics warehouse).
  useEffect(() => { track('session_started'); }, []);

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

  // Deep links: /?story=<id> opens that story once articles have loaded. If it's
  // featured today we fly to it; otherwise fetch it directly and open the modal.
  useEffect(() => {
    if (loading || error || !pendingStoryId) return;
    const id = pendingStoryId;
    setPendingStoryId(null);                       // consume exactly once
    const found = articles.find(a => String(a.id) === id);
    if (found) {
      if (WEBGL_OK && found.latitude != null) setFlyTo(found);
      else setSelected([found]);
    } else {
      fetchArticle(id)
        .then(a => { if (a) setSelected([a]); })
        .catch(() => { /* stale link — ignore */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, error, pendingStoryId]);

  // Keep the URL shareable: reflect the open story in ?story=<id>. Held off
  // until the incoming deep link (if any) has been consumed.
  useEffect(() => {
    if (pendingStoryId) return;
    const url = new URL(window.location.href);
    if (selected && selected[0]) url.searchParams.set('story', selected[0].id);
    else url.searchParams.delete('story');
    window.history.replaceState(null, '', url);
  }, [selected, pendingStoryId]);

  // Autopilot finished (or was cancelled by the player taking the controls).
  const handleFlyEnd = useCallback((arrivedArticle) => {
    setFlyTo(null);
    if (arrivedArticle) {
      setSelected([arrivedArticle]);
      track('story_opened', { article: arrivedArticle, meta: { via: 'autopilot' } });
    }
  }, []);

  // A rating was submitted — fold the fresh avg/count back into our article
  // list AND the open cluster, so both reopening the story and paging away/back
  // within a cluster show it (the list is only fetched once).
  const handleRated = useCallback((updated) => {
    const merge = (a) =>
      a.id === updated.id
        ? { ...a, avg_rating: updated.avg_rating, rating_count: updated.rating_count }
        : a;
    setArticles(prev => prev.map(merge));
    setSelected(prev => (prev ? prev.map(merge) : prev));
  }, []);

  // Categories actually present, with counts, for the filter bar.
  const categories = useMemo(() => {
    const counts = {};
    for (const a of articles) counts[a.category] = (counts[a.category] || 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [articles]);

  const filteredArticles = useMemo(() => (
    activeCategory === 'all' ? articles : articles.filter(a => a.category === activeCategory)
  ), [articles, activeCategory]);

  const fallback = <StoryListFallback articles={filteredArticles} onOpen={openStory} />;

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
          {WEBGL_OK ? (
            <GlobeErrorBoundary fallback={fallback}>
              <GlobeScene
                articles={filteredArticles}
                onOpenArticle={openStory}
                activeArticle={selected}
                flyTo={flyTo}
                onFlyEnd={handleFlyEnd}
              />
            </GlobeErrorBoundary>
          ) : fallback}

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

          {/* Story list panel — pick a story and the ship flies you there */}
          <aside className={`story-panel ${panelOpen ? 'open' : ''}`}>
            <div className="story-panel-head">
              {filteredArticles.length} {activeCategory === 'all' ? '' : activeCategory + ' '}stories
              {WEBGL_OK && <span className="story-panel-hint"> — tap one to fly there</span>}
            </div>
            <div className="story-panel-list">
              {filteredArticles.map(a => (
                <button
                  key={a.id}
                  className="story-row"
                  onClick={() => {
                    setPanelOpen(false);
                    if (WEBGL_OK && a.latitude != null) {
                      setFlyTo(a);
                      track('fly_to_story', { article: a });
                    } else {
                      openStory([a]);
                    }
                  }}
                >
                  <span className="story-row-dot" style={{ background: CATEGORY_COLORS[a.category] || '#7EE8A2' }} />
                  <span className="story-row-text">
                    <span className="story-row-source">
                      {a.source}{a.published_at ? ` · ${timeAgo(a.published_at)}` : ''}
                      {isNew(a.published_at) && <span className="news-new-badge">NEW</span>}
                    </span>
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
          onRated={handleRated}
        />
      )}
    </div>
  );
}
