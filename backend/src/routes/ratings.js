import { Router } from 'express';
import { insertRating, getArticleById } from '../db.js';

const router = Router();

router.post('/', (req, res) => {
  const { article_id, rating } = req.body;

  if (!article_id || rating === undefined) {
    return res.status(400).json({ error: 'article_id and rating are required' });
  }

  const ratingNum = parseInt(rating);
  if (ratingNum < 1 || ratingNum > 5 || isNaN(ratingNum)) {
    return res.status(400).json({ error: 'Rating must be between 1 and 5' });
  }

  try {
    const article = getArticleById(article_id);
    if (!article) return res.status(404).json({ error: 'Article not found' });

    insertRating(article_id, ratingNum);
    const updated = getArticleById(article_id);
    res.json({ success: true, article: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
