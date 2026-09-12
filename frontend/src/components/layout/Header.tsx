import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { classNames } from '@/utils/format';

const LINKS = [
  { to: '/jobs', label: 'Jobs' },
  { to: '/track', label: 'Track Application' },
];

export function Header() {
  const [open, setOpen] = useState(false);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    classNames(
      'rounded-lg px-3 py-2 text-sm font-medium transition',
      isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    );

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            MJB
          </span>
          <span className="hidden text-sm font-semibold leading-tight text-slate-900 sm:block">
            Mini Job Board
            <span className="block text-xs font-normal text-slate-500">Application Tracker</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} className={linkClass}>
              {link.label}
            </NavLink>
          ))}
          <Link
            to="/admin/login"
            className="ml-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Admin Login
          </Link>
        </nav>

        <button
          type="button"
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d={open ? 'M6 18 18 6M6 6l12 12' : 'M4 7h16M4 12h16M4 17h16'} />
          </svg>
        </button>
      </div>

      {open && (
        <nav className="border-t border-slate-200 bg-white px-4 py-3 md:hidden" aria-label="Mobile">
          <div className="flex flex-col gap-1">
            {LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} className={linkClass} onClick={() => setOpen(false)}>
                {link.label}
              </NavLink>
            ))}
            <NavLink to="/admin/login" className={linkClass} onClick={() => setOpen(false)}>
              Admin Login
            </NavLink>
          </div>
        </nav>
      )}
    </header>
  );
}
