import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import StarRating from './StarRating.jsx';
import { submitRating } from '../../utils/api.js';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '../Globe/NewsMarker.jsx';

// `articles` is the cluster opened from a marker (or a single-item list from the
// story panel). The modal pages through co-located stories.
export default function NewsModal({ articles, onClose }) {
  const list = Array.isArray(articles) ? articles : articles ? [articles] : [];
  const [index, setIndex] = useState(0);
  const [rated, setRated] = useState(false);
  const [avgRating, setAvgRating] = useState(0);
  const [copied, setCopied] = useState(false);

  const article = list[index];

  // Deep link for this story — native share sheet where available, else copy.
  const handleShare = async () => {
    const url = `${window.location.origin}/?story=${article.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: article.title, text: 'Some good news for you 🌍', url });
        return;
      } catch { /* user dismissed the sheet — fall through to copy */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Share failed:', err);
    }
  };

  // Reset per-article state when paging.
  useEffect(() => {
    setRated(false);
    setAvgRating(article?.avg_rating || 0);
  }, [index, article]);

  if (!article) return null;

  const color = CATEGORY_COLORS[article.category] || '#7EE8A2';
  const icon = CATEGORY_ICONS[article.category] || '🌍';

  const handleRate = async (rating) => {
    try {
      const result = await submitRating(article.id, rating);
      setAvgRating(result.article?.avg_rating || avgRating);
      setRated(true);
    } catch (err) {
      console.error('Rating failed:', err);
    }
  };

  const formatDate = (dateStr) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    } catch { return ''; }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          className="modal-content"
          initial={{ scale: 0.8, y: 40, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.8, y: 40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        >
          {/* Image */}
          {article.image_url && (
            <div
              className="modal-image"
              style={{ backgroundImage: `url("${article.image_url}")` }}
            />
          )}

          {/* Cluster pager */}
          {list.length > 1 && (
            <div className="modal-pager">
              <button
                className="modal-pager-btn"
                onClick={() => setIndex(i => (i - 1 + list.length) % list.length)}
                aria-label="Previous story"
              >‹</button>
              <span className="modal-pager-label">{index + 1} / {list.length} stories here</span>
              <button
                className="modal-pager-btn"
                onClick={() => setIndex(i => (i + 1) % list.length)}
                aria-label="Next story"
              >›</button>
            </div>
          )}

          {/* Category badge */}
          <div>
            <span className="modal-category" style={{ background: `${color}22`, color }}>
              {icon} {article.category}
            </span>
          </div>

          {/* Title */}
          <h2 className="modal-title">{article.title}</h2>

          {/* Meta */}
          <div className="modal-meta">
            <span>📰 {article.source}</span>
            {article.published_at && <span>· {formatDate(article.published_at)}</span>}
            {avgRating > 0 && (
              <span>· ⭐ {Number(avgRating).toFixed(1)} ({article.rating_count} ratings)</span>
            )}
          </div>

          {/* Description */}
          {article.description && (
            <p className="modal-description">{article.description}</p>
          )}

          {/* Rating */}
          <div style={{ marginBottom: 20, padding: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: 12 }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 10, fontWeight: 600 }}>
              {rated ? 'Thanks for your rating!' : 'How uplifting was this story?'}
            </div>
            <StarRating key={article.id} onRate={handleRate} currentRating={0} />
          </div>

          {/* Actions */}
          <div className="modal-actions">
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-read"
              style={{ background: `linear-gradient(135deg, ${color}, ${color}99)` }}
            >
              Read Full Story →
            </a>
            <button className="btn-close" onClick={handleShare}>
              {copied ? '✓ Link copied!' : '↗ Share'}
            </button>
            <button className="btn-close" onClick={onClose}>
              Close
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
