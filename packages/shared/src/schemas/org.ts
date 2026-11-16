import { z } from 'zod';

/** `?includeClosed=true` also lists closed (deactivated) items; pickers use the default (open only). */
export const orgListQuerySchema = z.object({
  includeClosed: z.preprocess((v) => (v === 'true' || v === true ? true : v === 'false' || v === false ? false : v), z.boolean().optional()),
});
export type OrgListQuery = z.infer<typeof orgListQuerySchema>;

/** Geofence limits (FR-WS-02.4): radius in metres for mobile check-in. */
export const GEOFENCE_RADIUS = { min: 20, max: 5000, default: 150 } as const;

const branchFields = z.object({
  name: z.string().trim().min(1, 'required').max(120),
  address: z.string().trim().max(300).optional(),
  /** WGS84 degrees; `null` clears the geofence (send latitude and longitude together). */
  latitude: z.number().finite().min(-90, 'invalid_latitude').max(90, 'invalid_latitude').nullable().optional(),
  longitude: z.number().finite().min(-180, 'invalid_longitude').max(180, 'invalid_longitude').nullable().optional(),
  /** Geofence radius in metres for mobile check-in. */
  geofenceRadius: z
    .number()
    .int('invalid_radius')
    .min(GEOFENCE_RADIUS.min, 'invalid_radius')
    .max(GEOFENCE_RADIUS.max, 'invalid_radius')
    .default(GEOFENCE_RADIUS.default),
});

/** Latitude and longitude are both set or both empty. */
export const isGeofenceComplete = (v: { latitude?: number | null; longitude?: number | null }): boolean =>
  (v.latitude === null || v.latitude === undefined) === (v.longitude === null || v.longitude === undefined);
const geofenceIncomplete = { message: 'geofence_incomplete', path: ['latitude'] };

export const createBranchSchema = branchFields.refine(isGeofenceComplete, geofenceIncomplete);
export type CreateBranchInput = z.input<typeof createBranchSchema>;
/** Partial update; the API re-checks the merged coordinates (a PATCH may send only one of them). */
export const updateBranchSchema = branchFields.partial();
export type UpdateBranchInput = z.input<typeof updateBranchSchema>;

export const branchSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  geofenceRadius: z.number(),
  isActive: z.boolean(),
  employeeCount: z.number(),
});
export type Branch = z.infer<typeof branchSchema>;

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(1, 'required').max(120),
  parentId: z.string().optional(),
  headEmployeeId: z.string().optional(),
});
export type CreateDepartmentInput = z.input<typeof createDepartmentSchema>;
/** Partial update; `parentId: null` moves the department to the top level. */
export const updateDepartmentSchema = createDepartmentSchema.extend({ parentId: z.string().nullable() }).partial();
export type UpdateDepartmentInput = z.input<typeof updateDepartmentSchema>;

export const departmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  headEmployeeId: z.string().nullable(),
  isActive: z.boolean(),
  employeeCount: z.number(),
});
export type Department = z.infer<typeof departmentSchema>;

export const createPositionSchema = z.object({
  name: z.string().trim().min(1, 'required').max(120),
  level: z.number().int().min(0).max(20).default(0),
});
export type CreatePositionInput = z.input<typeof createPositionSchema>;
export const updatePositionSchema = createPositionSchema.partial();

export const positionSchema = z.object({ id: z.string(), name: z.string(), level: z.number(), isActive: z.boolean() });
export type Position = z.infer<typeof positionSchema>;

export interface OrgChartNode {
  id: string;
  employeeCode: string;
  name: string;
  position: string | null;
  department: string | null;
  children: OrgChartNode[];
}
export const orgChartNodeSchema: z.ZodType<OrgChartNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    employeeCode: z.string(),
    name: z.string(),
    position: z.string().nullable(),
    department: z.string().nullable(),
    children: z.array(orgChartNodeSchema),
  }),
);

/** Build a manager → reports tree from a flat list. Cycles and orphans become roots. */
export const buildOrgTree = (
  rows: readonly { id: string; managerId: string | null; node: Omit<OrgChartNode, 'children'> }[],
): OrgChartNode[] => {
  const map = new Map<string, OrgChartNode>();
  rows.forEach((r) => map.set(r.id, { ...r.node, children: [] }));
  const roots: OrgChartNode[] = [];
  const parentOf = new Map(rows.map((r) => [r.id, r.managerId]));
  const createsCycle = (id: string): boolean => {
    const seen = new Set<string>([id]);
    let cur = parentOf.get(id) ?? null;
    while (cur) {
      if (seen.has(cur)) return true;
      seen.add(cur);
      cur = parentOf.get(cur) ?? null;
    }
    return false;
  };
  rows.forEach((r) => {
    const node = map.get(r.id)!;
    const parent = r.managerId ? map.get(r.managerId) : undefined;
    if (parent && !createsCycle(r.id)) parent.children.push(node);
    else roots.push(node);
  });
  return roots;
};
