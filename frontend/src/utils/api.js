import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export async function fetchArticles() {
  const { data } = await api.get('/articles');
  return data.articles || [];
}

// Single article by id — used for deep links to stories that aren't in
// today's featured set.
export async function fetchArticle(id) {
  const { data } = await api.get(`/articles/${id}`);
  return data.article || null;
}

export async function submitRating(articleId, rating) {
  const { data } = await api.post('/ratings', { article_id: articleId, rating });
  return data;
}
