import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function AboutModal({ onClose }) {
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
          <h2 className="modal-title">🌍 About Good Earth News</h2>

          <p className="modal-description">
            The news doesn&apos;t have to be doom-scrolling. Good Earth News shows{' '}
            <strong>only positive environmental stories</strong> — species recoveries,
            clean-energy milestones, rewilding wins — each pinned to the place on
            Earth where it actually happened. Fly the ship around the planet, or tap
            any glowing marker to read the story.
          </p>

          <div className="about-how">
            <div className="about-how-title">How it works</div>
            <ol className="about-steps">
              <li>A pipeline aggregates articles from ~18 environmental news feeds.</li>
              <li>
                Each article is reviewed by <strong>Claude</strong> (an AI model) acting
                as an editor — it verifies the story is genuinely positive, scores its
                sentiment, categorizes it, and pinpoints its location.
              </li>
              <li>Verified stories join a curated library; a fresh set is featured every day.</li>
            </ol>
          </div>

          <p className="modal-description" style={{ marginBottom: 16 }}>
            Built with React, Three.js, Node.js, SQLite and the Claude API.
          </p>

          <div className="modal-actions">
            <a
              href="https://github.com/RealBearInForest/GoodEarthNews"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-read"
            >
              View on GitHub →
            </a>
            <button className="btn-close" onClick={onClose}>Close</button>
          </div>

          <div className="about-credit">Created by Jason and Sabrina</div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
