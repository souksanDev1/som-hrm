import { z } from 'zod';

export const idSchema = z.string().min(1);
export const idParamsSchema = z.object({ id: idSchema });

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const paginatedSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  });
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

/** ISO date string (YYYY-MM-DD). */
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid_date');

/** Treat empty form inputs ("" / null) as "not provided" for optional fields. */
export const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' || v === null ? undefined : v), schema.optional());

/**
 * Lao phone numbers: mobile 020 XXXX XXXX, landline 030 XXX XXXX, with optional +856.
 * Normalised to the local form without spaces (e.g. 02055551234).
 */
export const normalizeLaoPhone = (raw: string): string => {
  const digits = raw.replace(/[^\d]/g, '');
  const local = digits.startsWith('856') ? digits.slice(3) : digits.startsWith('0') ? digits.slice(1) : digits;
  return `0${local}`;
};
const LAO_PHONE = /^0(20\d{8}|30\d{7})$/;
export const laoPhoneSchema = z
  .string()
  .trim()
  .transform(normalizeLaoPhone)
  .refine((v) => LAO_PHONE.test(v), 'invalid_phone');
