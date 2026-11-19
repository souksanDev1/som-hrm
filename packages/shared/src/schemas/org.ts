import { z } from 'zod';
import { AttendanceMode } from '../enums';

/** `?includeClosed=true` also lists closed (deactivated) items; pickers use the default (open only). */
export const orgListQuerySchema = z.object({
  includeClosed: z.preprocess((v) => (v === 'true' || v === true ? true : v === 'false' || v === false ? false : v), z.boolean().optional()),
});
export type OrgListQuery = z.infer<typeof orgListQuerySchema>;

/** Geofence limits (FR-WS-02.4): radius in metres for mobile check-in. */
export const GEOFENCE_RADIUS = { min: 20, max: 5000, default: 150 } as const;

/** Office Wi-Fi list limits (FR-ATT-12): entries are SSID names (≤ 32 bytes in 802.11) or BSSID MAC addresses. */
export const BRANCH_WIFI = { maxEntries: 20, maxLength: 64 } as const;

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
  /**
   * FR-ATT-12 (SHOULD): office Wi-Fi networks — SSID names or BSSID MAC addresses. A mobile punch inside the
   * geofence from a phone not on one of them is flagged WIFI_MISMATCH for review. Empty list = check off.
   */
  wifiNetworks: z
    .array(z.string().trim().min(1, 'required').max(BRANCH_WIFI.maxLength, 'wifi_too_long'))
    .max(BRANCH_WIFI.maxEntries, 'wifi_too_many')
    .transform((list) => [...new Set(list)])
    .optional(),
  /** FR-WS-06: attendance modes enabled at this branch; several at once (06.4), at least one. */
  attendanceModes: z
    .array(z.nativeEnum(AttendanceMode))
    .min(1, 'attendance_modes_required')
    .transform((m) => [...new Set(m)])
    .optional(),
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
  attendanceModes: z.array(z.nativeEnum(AttendanceMode)),
  wifiNetworks: z.array(z.string()),
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
/** Partial update; `headEmployeeId: null` clears the department head. */
export const updateDepartmentSchema = createDepartmentSchema.extend({ parentId: z.string().nullable(), headEmployeeId: z.string().nullable() }).partial();
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

/** Department structure chart (Chairman → CEO → departments → staff). */
export interface OrgStructureMember {
  id: string;
  employeeCode: string;
  name: string;
  position: string | null;
}
export interface OrgStructureNode {
  id: string;
  /** `unassigned` = synthetic node for active staff without an open department. */
  kind: 'department' | 'unassigned';
  name: string;
  head: OrgStructureMember | null;
  /** Active members of this department only (sub-units not included). */
  employeeCount: number;
  /** Active members, head excluded, sorted by name. */
  members: OrgStructureMember[];
  children: OrgStructureNode[];
}
export const UNASSIGNED_NODE_ID = 'unassigned';

const orgStructureMemberSchema = z.object({ id: z.string(), employeeCode: z.string(), name: z.string(), position: z.string().nullable() });
export const orgStructureNodeSchema: z.ZodType<OrgStructureNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    kind: z.enum(['department', 'unassigned']),
    name: z.string(),
    head: orgStructureMemberSchema.nullable(),
    employeeCount: z.number(),
    members: z.array(orgStructureMemberSchema),
    children: z.array(orgStructureNodeSchema),
  }),
);

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

/**
 * Build the department tree from open departments and active employees. A department whose parent is
 * missing (closed) or whose parent chain loops is a root. Staff with no open department go into a
 * trailing `unassigned` node, added only when non-empty.
 */
export const buildOrgStructure = (input: {
  departments: readonly { id: string; name: string; parentId: string | null; headEmployeeId: string | null }[];
  employees: readonly (OrgStructureMember & { departmentId: string | null })[];
}): OrgStructureNode[] => {
  const member = ({ id, employeeCode, name, position }: OrgStructureMember): OrgStructureMember => ({ id, employeeCode, name, position });
  const empById = new Map(input.employees.map((e) => [e.id, e]));
  const deptIds = new Set(input.departments.map((d) => d.id));
  const parentOf = new Map(input.departments.map((d) => [d.id, d.parentId]));
  /** Departments on `id`'s parent chain, or `null` when the chain ends (no loop). */
  const loopFrom = (id: string): Set<string> | null => {
    const seen = new Set([id]);
    let cur = parentOf.get(id) ?? null;
    while (cur && deptIds.has(cur)) {
      if (seen.has(cur)) return seen;
      seen.add(cur);
      cur = parentOf.get(cur) ?? null;
    }
    return null;
  };
  // Break each parent loop at its first-listed department, which becomes a root.
  const loopRoots = new Set<string>();
  input.departments.forEach((d) => {
    const chain = loopFrom(d.id);
    if (chain && ![...chain].some((id) => loopRoots.has(id))) loopRoots.add(d.id);
  });

  const nodes = new Map<string, OrgStructureNode>();
  input.departments.forEach((d) => {
    const headRow = d.headEmployeeId ? empById.get(d.headEmployeeId) : undefined;
    const staff = input.employees.filter((e) => e.departmentId === d.id);
    nodes.set(d.id, {
      id: d.id,
      kind: 'department',
      name: d.name,
      head: headRow ? member(headRow) : null,
      employeeCount: staff.length,
      members: staff.filter((e) => e.id !== headRow?.id).map(member).sort(byName),
      children: [],
    });
  });

  const roots: OrgStructureNode[] = [];
  input.departments.forEach((d) => {
    const node = nodes.get(d.id)!;
    const parent = d.parentId ? nodes.get(d.parentId) : undefined;
    if (parent && !loopRoots.has(d.id)) parent.children.push(node);
    else roots.push(node);
  });
  const sortTree = (list: OrgStructureNode[]) => {
    list.sort(byName);
    list.forEach((n) => sortTree(n.children));
  };
  sortTree(roots);

  const unassigned = input.employees.filter((e) => !e.departmentId || !deptIds.has(e.departmentId));
  if (unassigned.length) {
    roots.push({
      id: UNASSIGNED_NODE_ID,
      kind: 'unassigned',
      name: '',
      head: null,
      employeeCount: unassigned.length,
      members: unassigned.map(member).sort(byName),
      children: [],
    });
  }
  return roots;
};
