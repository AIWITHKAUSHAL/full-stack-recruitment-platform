import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { useId } from 'react';
import { classNames } from '@/utils/format';
import { InlineError } from './ErrorMessage';

interface FieldWrapperProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  htmlFor: string;
  children: ReactNode;
}

function FieldWrapper({ label, required, error, hint, htmlFor, children }: FieldWrapperProps) {
  return (
    <div>
      <label htmlFor={htmlFor} className="field-label">
        {label}
        {required && (
          <span className="ml-0.5 text-red-500" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
      <InlineError message={error} />
    </div>
  );
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export function TextField({ label, error, hint, required, className, ...rest }: TextFieldProps) {
  const id = useId();
  return (
    <FieldWrapper label={label} required={required} error={error} hint={hint} htmlFor={id}>
      <input
        id={id}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={classNames('field-control', error && 'field-control-invalid', className)}
        {...rest}
      />
    </FieldWrapper>
  );
}

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  hint?: string;
}

export function TextAreaField({ label, error, hint, required, className, ...rest }: TextAreaFieldProps) {
  const id = useId();
  return (
    <FieldWrapper label={label} required={required} error={error} hint={hint} htmlFor={id}>
      <textarea
        id={id}
        required={required}
        aria-invalid={Boolean(error)}
        className={classNames('field-control', error && 'field-control-invalid', className)}
        {...rest}
      />
    </FieldWrapper>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  hint?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export function SelectField({
  label,
  error,
  hint,
  options,
  placeholder,
  required,
  className,
  ...rest
}: SelectFieldProps) {
  const id = useId();
  return (
    <FieldWrapper label={label} required={required} error={error} hint={hint} htmlFor={id}>
      <select
        id={id}
        required={required}
        aria-invalid={Boolean(error)}
        className={classNames('field-control appearance-none pr-8', error && 'field-control-invalid', className)}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldWrapper>
  );
}

interface FileFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  fileName?: string | null;
  onClear?: () => void;
}

export function FileField({ label, error, hint, fileName, onClear, className, ...rest }: FileFieldProps) {
  const id = useId();
  return (
    <FieldWrapper label={label} error={error} hint={hint} htmlFor={id}>
      <input
        id={id}
        type="file"
        aria-invalid={Boolean(error)}
        className={classNames(
          'block w-full cursor-pointer rounded-lg border border-slate-300 bg-white text-sm text-slate-600 shadow-sm',
          'file:mr-3 file:cursor-pointer file:rounded-l-lg file:border-0 file:bg-slate-100 file:px-4 file:py-2',
          'file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200',
          error && 'border-red-400',
          className,
        )}
        {...rest}
      />
      {fileName && (
        <p className="mt-1.5 flex items-center gap-2 text-xs text-slate-600">
          <span className="truncate">Selected: {fileName}</span>
          {onClear && (
            <button type="button" onClick={onClear} className="font-medium text-brand-600 hover:underline">
              Remove
            </button>
          )}
        </p>
      )}
    </FieldWrapper>
  );
}
