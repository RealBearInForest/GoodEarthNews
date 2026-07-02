import axios from 'axios';

// Anonymous engagement tracking (feeds the BigQuery analytics pipeline).
// No PII: the session id is a random UUID that lives only for this browser
// session. Failures are swallowed — analytics must never break the app.

function sessionId() {
  try {
    let id = sessionStorage.getItem('gew-session');
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem('gew-session', id);
    }
    return id;
  } catch {
    return null; // storage blocked — track without a session id
  }
}

export function track(event_type, { article = null, meta = null } = {}) {
  try {
    axios.post('/api/events', {
      event_type,
      article_id: article?.id ?? null,
      category: article?.category ?? null,
      session_id: sessionId(),
      meta,
    }).catch(() => {});
  } catch {
    /* never let analytics interfere with the app */
  }
}
