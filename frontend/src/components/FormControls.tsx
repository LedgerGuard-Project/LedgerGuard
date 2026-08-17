import {
  forwardRef,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '../lib/utils';

export const FormInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn('input', className)} {...props} />
  ),
);
FormInput.displayName = 'FormInput';

export const FormTextarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} rows={4} className={cn('input', className)} {...props} />
));
FormTextarea.displayName = 'FormTextarea';

export const FormSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn('input appearance-none', className)} {...props}>
      {children}
    </select>
  ),
);
FormSelect.displayName = 'FormSelect';

export const FormField: React.FC<{ label: string; htmlFor?: string; hint?: string }> = ({
  label,
  htmlFor,
  hint,
}) => (
  <label htmlFor={htmlFor} className="label">
    {label}
    {hint && <span className="block text-xs text-ink-500 dark:text-ink-400">{hint}</span>}
  </label>
);