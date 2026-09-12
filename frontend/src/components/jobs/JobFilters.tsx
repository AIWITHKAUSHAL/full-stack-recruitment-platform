import { Button } from '@/components/common/Button';
import { SelectField, TextField } from '@/components/common/FormField';
import { EMPLOYMENT_TYPE_LABELS, type JobFilterOptions, type JobSort } from '@/types/api';

export interface JobFilterValues {
  search: string;
  department: string;
  location: string;
  employment_type: string;
  sort: JobSort;
}

interface JobFiltersProps {
  values: JobFilterValues;
  options: JobFilterOptions | null;
  resultCount?: number;
  onChange: (patch: Partial<JobFilterValues>) => void;
  onReset: () => void;
}

/** Dropdown values come from the API, so a new department needs no code change. */
export function JobFilters({ values, options, resultCount, onChange, onReset }: JobFiltersProps) {
  const hasFilters = Boolean(
    values.search || values.department || values.location || values.employment_type || values.sort !== 'newest',
  );

  const toOptions = (items: string[]) => items.map((item) => ({ value: item, label: item }));

  return (
    <section aria-label="Filter jobs" className="card p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <TextField
            label="Search"
            type="search"
            placeholder="Job title, skill or keyword"
            value={values.search}
            onChange={(event) => onChange({ search: event.target.value })}
          />
        </div>
        <SelectField
          label="Department"
          placeholder="All departments"
          value={values.department}
          options={toOptions(options?.departments ?? [])}
          onChange={(event) => onChange({ department: event.target.value })}
        />
        <SelectField
          label="Location"
          placeholder="All locations"
          value={values.location}
          options={toOptions(options?.locations ?? [])}
          onChange={(event) => onChange({ location: event.target.value })}
        />
        <SelectField
          label="Employment type"
          placeholder="All types"
          value={values.employment_type}
          options={(options?.employment_types ?? []).map((type) => ({
            value: type,
            label: EMPLOYMENT_TYPE_LABELS[type],
          }))}
          onChange={(event) => onChange({ employment_type: event.target.value })}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <p className="text-sm text-slate-600">
          {resultCount === undefined ? (
            'Searching…'
          ) : (
            <>
              <span className="font-semibold text-slate-900">{resultCount}</span>{' '}
              {resultCount === 1 ? 'role matches' : 'roles match'} your filters
            </>
          )}
        </p>
        <div className="flex items-center gap-3">
          <label htmlFor="job-sort" className="text-sm text-slate-600">
            Sort
          </label>
          <select
            id="job-sort"
            className="field-control w-auto py-1.5 text-sm"
            value={values.sort}
            onChange={(event) => onChange({ sort: event.target.value as JobSort })}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="title_asc">Title A–Z</option>
            <option value="title_desc">Title Z–A</option>
          </select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={onReset}>
              Reset filters
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
