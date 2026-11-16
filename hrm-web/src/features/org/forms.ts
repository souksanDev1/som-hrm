import {
  isGeofenceComplete,
  updateBranchSchema,
  updateDepartmentSchema,
  updatePositionSchema,
  type Branch,
  type Department,
  type Position,
  type UpdateBranchInput,
  type UpdateDepartmentInput,
} from '@hrm/shared';
import type { ZodError } from 'zod';
import { ApiError } from '@/lib/api-client';

/** Form values are kept as strings; `parse*` turns them into an API payload or per-field error codes. */
export type FormValues = Record<string, string>;
export type ParseResult<T> = { ok: true; data: T } | { ok: false; errors: Record<string, string> };

const zodErrors = (err: ZodError): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = String(issue.path[0] ?? 'form');
    // Zod's own messages (wrong type, …) are not translation keys; fall back to a generic code.
    out[key] ??= /^[a-z_]+$/.test(issue.message) ? issue.message : 'invalid';
  }
  return out;
};

/** '' → null (cleared); otherwise a number, or NaN when the text is not numeric. */
const optionalNumber = (raw: string | undefined): number | null => {
  const v = (raw ?? '').trim();
  return v === '' ? null : Number(v);
};

export const branchFormValues = (b: Branch): FormValues => ({
  name: b.name,
  address: b.address ?? '',
  latitude: b.latitude === null ? '' : String(b.latitude),
  longitude: b.longitude === null ? '' : String(b.longitude),
  geofenceRadius: String(b.geofenceRadius),
});

/** Branch edit incl. the GPS geofence (FR-WS-02.4); mirrors the API checks so errors show before submitting. */
export const parseBranchForm = (v: FormValues): ParseResult<UpdateBranchInput> => {
  const latitude = optionalNumber(v.latitude);
  const longitude = optionalNumber(v.longitude);
  const errors: Record<string, string> = {};
  if (Number.isNaN(latitude)) errors.latitude = 'invalid_latitude';
  if (Number.isNaN(longitude)) errors.longitude = 'invalid_longitude';
  const radius = (v.geofenceRadius ?? '').trim();
  if (Object.keys(errors).length) return { ok: false, errors };
  const parsed = updateBranchSchema.safeParse({
    name: v.name,
    address: v.address?.trim() ? v.address : undefined,
    latitude,
    longitude,
    geofenceRadius: radius === '' ? Number.NaN : Number(radius),
  });
  if (!parsed.success) {
    const e = zodErrors(parsed.error);
    if (e.geofenceRadius) e.geofenceRadius = 'invalid_radius';
    return { ok: false, errors: e };
  }
  if (!isGeofenceComplete(parsed.data)) return { ok: false, errors: { latitude: 'geofence_incomplete', longitude: 'geofence_incomplete' } };
  return { ok: true, data: parsed.data };
};

export const departmentFormValues = (d: Department): FormValues => ({ name: d.name, parentId: d.parentId ?? '' });

/** Empty parent = top level (`parentId: null`). */
export const parseDepartmentForm = (v: FormValues): ParseResult<UpdateDepartmentInput> => {
  const parsed = updateDepartmentSchema.safeParse({ name: v.name, parentId: v.parentId || null });
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  return { ok: true, data: parsed.data };
};

export const positionFormValues = (p: Position): FormValues => ({ name: p.name, level: String(p.level) });

export const parsePositionForm = (v: FormValues): ParseResult<{ name?: string; level?: number }> => {
  const level = (v.level ?? '').trim();
  const parsed = updatePositionSchema.safeParse({ name: v.name, level: level === '' ? 0 : Number(level) });
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  return { ok: true, data: parsed.data };
};

/**
 * Map an API error onto form fields: `details.fields` (service errors) or the zod validation
 * `details[].path` (request schema errors); anything else is a form-level error.
 */
export const apiFieldErrors = (err: unknown): Record<string, string> => {
  if (!(err instanceof ApiError)) return { form: 'unknown' };
  const details = err.details as { fields?: string[] } | { path?: string; message?: string }[] | undefined;
  if (Array.isArray(details) && err.code === 'validation_error') {
    const out: Record<string, string> = {};
    for (const d of details) {
      const key = (d.path ?? '').split('.')[0] || 'form';
      out[key] ??= d.message && /^[a-z_]+$/.test(d.message) ? d.message : 'validation_error';
    }
    return out;
  }
  const fields = !Array.isArray(details) ? details?.fields : undefined;
  if (fields?.length) return Object.fromEntries(fields.map((f) => [f, err.code]));
  if (err.code === 'name_taken') return { name: err.code };
  return { form: err.code };
};
