import { Link } from 'react-router-dom';
import { classNames } from '@/utils/format';

interface StatCardProps {
  label: string;
  value: number;
  hint?: string;
  to?: string;
  tone?: 'default' | 'brand' | 'emerald' | 'amber';
}

const TONES = {
  default: 'text-slate-900',
  brand: 'text-brand-700',
  emerald: 'text-emerald-700',
  amber: 'text-amber-700',
} as const;

export function StatCard({ label, value, hint, to, tone = 'default' }: StatCardProps) {
  const content = (
    <>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className={classNames('mt-2 text-3xl font-bold tabular-nums', TONES[tone])}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </>
  );

  if (to) {
    return (
      <Link to={to} className="card p-5 transition hover:border-brand-300 hover:shadow-md">
        {content}
      </Link>
    );
  }
  return <div className="card p-5">{content}</div>;
}

/** Horizontal bar breakdown — enough to read the funnel, no charting library. */
export function BreakdownBar({
  rows,
}: {
  rows: { label: string; count: number; className?: string }[];
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">{row.label}</span>
            <span className="font-medium tabular-nums text-slate-900">{row.count}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={classNames('h-full rounded-full', row.className ?? 'bg-brand-500')}
              style={{ width: `${(row.count / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
