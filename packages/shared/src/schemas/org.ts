import { z } from 'zod';

export const createBranchSchema = z.object({
  name: z.string().trim().min(1, 'required').max(120),
  address: z.string().trim().max(300).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  /** Geofence radius in metres for mobile check-in. */
  geofenceRadius: z.number().int().min(20).max(5000).default(150),
});
export type CreateBranchInput = z.input<typeof createBranchSchema>;
export const updateBranchSchema = createBranchSchema.partial();

export const branchSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  geofenceRadius: z.number(),
  employeeCount: z.number(),
});
export type Branch = z.infer<typeof branchSchema>;

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(1, 'required').max(120),
  parentId: z.string().optional(),
  headEmployeeId: z.string().optional(),
});
export type CreateDepartmentInput = z.input<typeof createDepartmentSchema>;
export const updateDepartmentSchema = createDepartmentSchema.partial();

export const departmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  headEmployeeId: z.string().nullable(),
  employeeCount: z.number(),
});
export type Department = z.infer<typeof departmentSchema>;

export const createPositionSchema = z.object({
  name: z.string().trim().min(1, 'required').max(120),
  level: z.number().int().min(0).max(20).default(0),
});
export type CreatePositionInput = z.input<typeof createPositionSchema>;
export const updatePositionSchema = createPositionSchema.partial();

export const positionSchema = z.object({ id: z.string(), name: z.string(), level: z.number() });
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
