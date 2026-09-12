import { NavLink } from 'react-router-dom';
import { classNames } from '@/utils/format';

const ITEMS = [
  { to: '/admin', label: 'Dashboard', icon: '▦', end: true },
  { to: '/admin/jobs', label: 'Jobs', icon: '≡', end: false },
  { to: '/admin/applications', label: 'Applications', icon: '☰', end: false },
];

export function AdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Admin" className="flex flex-col gap-1">
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            classNames(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
              isActive
                ? 'bg-brand-600 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            )
          }
        >
          <span aria-hidden="true" className="text-xs">
            {item.icon}
          </span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
