export function formatNumber(n, digits = 0) {
  if (n == null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(n);
}

export function formatBytes(bytes) {
  if (bytes == null || Number.isNaN(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = Math.max(0, Number(bytes));
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${formatNumber(v, v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDuration(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return '—';
  const s = Math.max(0, Math.round(Number(seconds)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 48) return `${formatNumber(h / 24, 1)} д`;
  if (h > 0) return `${h}ч ${m}м`;
  if (m > 0) return `${m}м ${sec}с`;
  return `${sec}с`;
}

export function formatDate(ms) {
  if (!ms) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(ms));
}

export function formatDay(ms) {
  if (!ms) return '—';
  return new Intl.DateTimeFormat('ru-RU', { month: 'short', day: 'numeric' }).format(new Date(ms));
}

export function formatPercent(fraction, digits = 1) {
  return `${formatNumber((fraction || 0) * 100, digits)}%`;
}

export function shortTaskName(name) {
  if (!name) return '—';
  return name.length > 42 ? `${name.slice(0, 20)}…${name.slice(-14)}` : name;
}

export function projectLabel(url, projects = []) {
  const found = projects.find((p) => p.masterUrl === url);
  return found?.name || url || '—';
}
