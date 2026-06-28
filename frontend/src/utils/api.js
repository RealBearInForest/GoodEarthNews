import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export async function fetchArticles() {
  const { data } = await api.get('/articles');
  return data.articles || [];
}

export async function submitRating(articleId, rating) {
  const { data } = await api.post('/ratings', { article_id: articleId, rating });
  return data;
}
