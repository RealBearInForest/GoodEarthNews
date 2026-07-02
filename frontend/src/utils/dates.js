// Small date helpers for story cards and the panel.

export function timeAgo(dateStr) {
  const then = new Date(dateStr).getTime();
  if (!Number.isFinite(then)) return '';
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// "Fresh" stories get a NEW badge.
export function isNew(dateStr, maxDays = 7) {
  const then = new Date(dateStr).getTime();
  return Number.isFinite(then) && Date.now() - then < maxDays * 86400000;
}
