import { Router } from 'express';
import { getFeaturedArticles, getArticleById } from '../db.js';

const router = Router();

// Today's featured set — a random 10–15 stories pulled from the stored library.
router.get('/', (req, res) => {
  try {
    const articles = getFeaturedArticles();
    res.json({ articles, total: articles.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const article = getArticleById(parseInt(req.params.id));
    if (!article) return res.status(404).json({ error: 'Article not found' });
    res.json({ article });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
