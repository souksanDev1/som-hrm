import { describe, expect, it } from 'vitest';
import {
  createBranchSchema,
  createHolidaySchema,
  defaultHolidaysForYear,
  haversineMetres,
  holidaysFor,
  isWithinGeofence,
  normalizeNationality,
  updateBranchSchema,
  yearRange,
  type HolidayRule,
} from '../src';

const office = { latitude: 17.9757, longitude: 102.6331, geofenceRadius: 150 };
/** ~111.2 m per 0.001° of latitude. */
const north = (metres: number) => ({ latitude: office.latitude + metres / 111_195, longitude: office.longitude });

describe('haversineMetres', () => {
  it('is zero for the same point and ~111.2 km per degree of latitude', () => {
    expect(haversineMetres(office, office)).toBe(0);
    expect(haversineMetres({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })).toBeCloseTo(111_195, -1);
  });
  it('is symmetric and handles the antimeridian', () => {
    const a = { latitude: 10, longitude: 179.9995 };
    const b = { latitude: 10, longitude: -179.9995 };
    expect(haversineMetres(a, b)).toBeCloseTo(haversineMetres(b, a), 6);
    expect(haversineMetres(a, b)).toBeLessThan(120);
  });
});

describe('isWithinGeofence', () => {
  it('accepts points inside the radius and on the boundary', () => {
    expect(isWithinGeofence(office, office)).toBe(true);
    expect(isWithinGeofence(north(100), office)).toBe(true);
    expect(isWithinGeofence(north(149.5), office)).toBe(true);
  });
  it('rejects points outside the radius', () => {
    expect(isWithinGeofence(north(151), office)).toBe(false);
    expect(isWithinGeofence(north(5000), office)).toBe(false);
  });
  it('rejects every point when the branch has no coordinates or the point is invalid', () => {
    expect(isWithinGeofence(office, { latitude: null, longitude: null, geofenceRadius: 150 })).toBe(false);
    expect(isWithinGeofence(office, { latitude: 17.97, longitude: null, geofenceRadius: 150 })).toBe(false);
    expect(isWithinGeofence({ latitude: Number.NaN, longitude: 102.6 }, office)).toBe(false);
  });
});

describe('branch geofence schema', () => {
  it('validates coordinate and radius ranges', () => {
    expect(createBranchSchema.safeParse({ name: 'HQ', latitude: 17.97, longitude: 102.63, geofenceRadius: 200 }).success).toBe(true);
    expect(createBranchSchema.safeParse({ name: 'HQ', latitude: 91, longitude: 102 }).error?.issues[0]?.message).toBe('invalid_latitude');
    expect(createBranchSchema.safeParse({ name: 'HQ', latitude: 17, longitude: 181 }).error?.issues[0]?.message).toBe('invalid_longitude');
    expect(createBranchSchema.safeParse({ name: 'HQ', geofenceRadius: 10 }).error?.issues[0]?.message).toBe('invalid_radius');
    expect(createBranchSchema.safeParse({ name: 'HQ', geofenceRadius: 5001 }).success).toBe(false);
  });
  it('requires latitude and longitude together on create; update may clear both with null', () => {
    expect(createBranchSchema.safeParse({ name: 'HQ', latitude: 17.9 }).error?.issues[0]?.message).toBe('geofence_incomplete');
    expect(updateBranchSchema.parse({ latitude: null, longitude: null })).toEqual({ latitude: null, longitude: null });
    expect(updateBranchSchema.parse({ name: 'X' })).toEqual({ name: 'X' });
  });
});

describe('holiday defaults and schema', () => {
  it('lists the statutory defaults for a year, with 8 March women-only', () => {
    const d = defaultHolidaysForYear(2027);
    expect(d.map((h) => h.date)).toEqual(['2027-01-01', '2027-03-08', '2027-04-14', '2027-04-15', '2027-04-16', '2027-05-01', '2027-12-02']);
    expect(d.filter((h) => h.womenOnly).map((h) => h.date)).toEqual(['2027-03-08']);
    expect(d.every((h) => h.kind === 'PUBLIC' && h.nationality === null)).toBe(true);
  });
  it('requires a nationality for a national day and treats empty as none', () => {
    const base = { date: '2027-09-02', nameLo: 'ວັນຊາດຫວຽດນາມ', nameEn: 'Vietnam National Day' };
    expect(createHolidaySchema.safeParse({ ...base, kind: 'NATIONAL_DAY' }).error?.issues[0]?.message).toBe('nationality_required');
    expect(createHolidaySchema.parse({ ...base, kind: 'NATIONAL_DAY', nationality: ' Vietnamese ' }).nationality).toBe('Vietnamese');
    expect(createHolidaySchema.parse({ ...base, kind: 'TRADITIONAL', nationality: '' }).nationality).toBeNull();
    expect(createHolidaySchema.safeParse({ ...base, date: '2027-9-2' }).success).toBe(false);
    expect(createHolidaySchema.safeParse({ ...base, date: '2027-02-30' }).error?.issues[0]?.message).toBe('invalid_date');
  });
});

describe('holidaysFor', () => {
  const h = (date: string, extra: Partial<HolidayRule> = {}): HolidayRule & { name: string } => ({
    date,
    womenOnly: false,
    nationality: null,
    name: date,
    ...extra,
  });
  const calendar = [
    h('2027-12-02'),
    h('2027-01-01'),
    h('2027-03-08', { womenOnly: true }),
    h('2027-09-02', { nationality: 'Vietnamese' }),
    h('2027-10-01', { nationality: 'Chinese' }),
    h('2028-01-01'),
  ];
  const y2027 = yearRange(2027);

  it('applies 8 March to female employees only', () => {
    expect(holidaysFor({ gender: 'FEMALE' }, calendar, y2027).map((x) => x.date)).toEqual(['2027-01-01', '2027-03-08', '2027-12-02']);
    expect(holidaysFor({ gender: 'MALE' }, calendar, y2027).map((x) => x.date)).toEqual(['2027-01-01', '2027-12-02']);
    expect(holidaysFor({ gender: 'OTHER' }, calendar, y2027).map((x) => x.date)).not.toContain('2027-03-08');
  });

  it('gives foreign employees their own national day only (case-insensitive)', () => {
    const vn = holidaysFor({ gender: 'MALE', nationality: '  vietnamese' }, calendar, y2027).map((x) => x.date);
    expect(vn).toEqual(['2027-01-01', '2027-09-02', '2027-12-02']);
    const cnWoman = holidaysFor({ gender: 'FEMALE', nationality: 'Chinese' }, calendar, y2027).map((x) => x.date);
    expect(cnWoman).toEqual(['2027-01-01', '2027-03-08', '2027-10-01', '2027-12-02']);
    expect(holidaysFor({ gender: 'MALE', nationality: null }, calendar, y2027)).toHaveLength(2);
  });

  it('filters by an inclusive date range and keeps the caller type', () => {
    const r = holidaysFor({ gender: 'MALE' }, calendar, { from: '2027-12-02', to: '2028-01-01' });
    expect(r.map((x) => x.name)).toEqual(['2027-12-02', '2028-01-01']);
    expect(holidaysFor({ gender: 'MALE' }, calendar, { from: '2027-02-01', to: '2027-02-28' })).toEqual([]);
  });

  it('normalises nationality keys', () => {
    expect(normalizeNationality('  Thai  People ')).toBe('thai people');
    expect(normalizeNationality('   ')).toBeNull();
    expect(normalizeNationality(undefined)).toBeNull();
  });
});
