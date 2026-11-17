import { formatTimeOfDay, parseTimeOfDay, type ParameterValueInput, type ParameterView } from '@hrm/shared';

type Translate = (key: string) => string;

/** Replace `{name}` placeholders in a translated string. */
export const fill = (template: string, vars: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));

/** Human-readable value with its unit, e.g. "90, 60, 30 ມື້" or "ເປີດ". */
export const formatParameterValue = (t: Translate, p: Pick<ParameterView, 'type' | 'unit'>, value: ParameterValueInput): string => {
  if (typeof value === 'boolean') return t(value ? 'param.enabled' : 'param.disabled');
  if (p.unit === 'timeOfDay' && typeof value === 'number') return formatTimeOfDay(value);
  const text = Array.isArray(value) ? value.join(', ') : String(value);
  return p.unit ? `${text} ${t(`param.unit.${p.unit}`)}` : text;
};

/** Value as typed into the edit form. */
export const valueToInput = (value: ParameterValueInput, unit?: string | null): string =>
  unit === 'timeOfDay' && typeof value === 'number'
    ? formatTimeOfDay(value)
    : typeof value === 'boolean' ? String(value) : Array.isArray(value) ? value.join(', ') : String(value);

/** Parse form input into the parameter's type; `null` when the text is not well-formed. */
export const parseParameterInput = (type: ParameterView['type'], raw: string, unit?: string | null): ParameterValueInput | null => {
  const text = raw.trim();
  if (unit === 'timeOfDay') return parseTimeOfDay(text);
  if (type === 'boolean') return text === 'true' ? true : text === 'false' ? false : null;
  if (type === 'int') return /^-?\d+$/.test(text) ? Number(text) : null;
  const parts = text.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length && parts.every((s) => /^-?\d+$/.test(s)) ? parts.map(Number) : null;
};

/** `YYYY-MM-DDTHH:mm` in local time, for <input type="datetime-local">. */
export const toDateTimeLocal = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
