import { useState } from 'react';
import { Button } from '@/components/common/Button';
import { StatusBadge } from '@/components/common/StatusBadge';
import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from '@/types/api';

interface StatusSelectorProps {
  current: ApplicationStatus;
  /** Legal next steps come from the API, which derives them from the single
   *  transition table on the server — the UI never invents its own rules. */
  allowed: ApplicationStatus[];
  saving: boolean;
  onChange: (status: ApplicationStatus, note: string) => void;
}

export function StatusSelector({ current, allowed, saving, onChange }: StatusSelectorProps) {
  const [selected, setSelected] = useState<ApplicationStatus | ''>('');
  const [note, setNote] = useState('');

  if (allowed.length === 0) {
    return (
      <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
        This application has reached a final decision (<StatusBadge status={current} />) and cannot
        be moved again.
      </div>
    );
  }

  const submit = () => {
    if (!selected) return;
    onChange(selected, note);
    setSelected('');
    setNote('');
  };

  return (
    <div className="space-y-4">
      <div>
        <span className="field-label">Move to</span>
        <div className="flex flex-wrap gap-2">
          {allowed.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setSelected(status)}
              aria-pressed={selected === status}
              className={
                selected === status
                  ? 'rounded-lg border-2 border-brand-600 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-800'
                  : 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50'
              }
            >
              {APPLICATION_STATUS_LABELS[status]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="status-note" className="field-label">
          Note (optional)
        </label>
        <textarea
          id="status-note"
          rows={2}
          className="field-control"
          placeholder="Why this decision? Added to the internal notes."
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>

      <Button onClick={submit} disabled={!selected} loading={saving}>
        {selected ? `Move to ${APPLICATION_STATUS_LABELS[selected]}` : 'Select a stage'}
      </Button>
    </div>
  );
}
