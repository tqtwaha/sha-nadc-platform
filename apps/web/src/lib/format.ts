// Small formatters shared by Claims screens (and reusable in others).

export function fmtKes(n: number): string {
  return 'KSh ' + n.toLocaleString('en-KE', { maximumFractionDigits: 0 });
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-KE', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 60)    return diffSec + 's ago';
  if (diffSec < 3600)  return Math.floor(diffSec / 60) + 'm ago';
  if (diffSec < 86400) return Math.floor(diffSec / 3600) + 'h ago';
  return Math.floor(diffSec / 86400) + 'd ago';
}
