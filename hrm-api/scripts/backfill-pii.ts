/**
 * PII backfill (B10, FR-EMP-10.2/10.3).
 *
 *   pnpm --filter @hrm/api db:backfill-pii
 *
 * For every employee, inside system (RLS-bypass) transactions:
 *   - encrypts the legacy plaintext `idCardNo` into `idCardNoEnc` and clears the plaintext;
 *   - fills the blind indexes `idCardNoHash` / `socialSecurityNoHash`.
 * Idempotent: rows already done are skipped. A value that duplicates another employee's in the
 * same workspace cannot be indexed (unique index); it is encrypted anyway, left without a hash and
 * listed in the report (ids only, never the values) so HR can correct the data and re-run.
 */
import { pathToFileURL } from 'node:url';
import { loadEnv } from '../src/config/env';
import { createDb, type Db, type Tx } from '../src/db/client';
import { createFieldCipher, type BlindIndexPurpose, type FieldCipher } from '../src/lib/crypto';

const BATCH = 200;

export interface BackfillReport {
  scanned: number;
  encrypted: number;
  nationalIdHashed: number;
  socialSecurityHashed: number;
  duplicates: { workspaceId: string; employeeId: string; field: 'idCardNo' | 'socialSecurityNo' }[];
}

const HASH_COLUMN = { national_id: 'idCardNoHash', social_security_no: 'socialSecurityNoHash' } as const;

const hashIsFree = async (tx: Tx, purpose: BlindIndexPurpose, workspaceId: string, employeeId: string, hash: string) =>
  (await tx.employee.count({ where: { workspaceId, [HASH_COLUMN[purpose]]: hash, NOT: { id: employeeId } } })) === 0;

export const backfillPii = async (db: Db, cipher: FieldCipher): Promise<BackfillReport> => {
  const report: BackfillReport = { scanned: 0, encrypted: 0, nationalIdHashed: 0, socialSecurityHashed: 0, duplicates: [] };
  let cursor: string | undefined;
  for (;;) {
    const done = await db.system(async (tx) => {
      const rows = await tx.employee.findMany({
        where: {
          OR: [
            { idCardNo: { not: null } },
            { idCardNoEnc: { not: null }, idCardNoHash: null },
            { socialSecurityNoEnc: { not: null }, socialSecurityNoHash: null },
          ],
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        select: { id: true, workspaceId: true, idCardNo: true, idCardNoEnc: true, idCardNoHash: true, socialSecurityNoEnc: true, socialSecurityNoHash: true },
        orderBy: { id: 'asc' },
        take: BATCH,
      });
      for (const e of rows) {
        report.scanned++;
        const data: { idCardNo?: null; idCardNoEnc?: string; idCardNoHash?: string; socialSecurityNoHash?: string } = {};

        const nationalId = e.idCardNo?.trim() || (e.idCardNoEnc ? cipher.decrypt(e.idCardNoEnc) : null);
        if (e.idCardNo !== null) {
          data.idCardNo = null;
          if (nationalId && !e.idCardNoEnc) {
            data.idCardNoEnc = cipher.encrypt(nationalId);
            report.encrypted++;
          }
        }
        const idHash = cipher.blindIndex('national_id', nationalId);
        if (idHash && !e.idCardNoHash) {
          if (await hashIsFree(tx, 'national_id', e.workspaceId, e.id, idHash)) {
            data.idCardNoHash = idHash;
            report.nationalIdHashed++;
          } else report.duplicates.push({ workspaceId: e.workspaceId, employeeId: e.id, field: 'idCardNo' });
        }

        if (e.socialSecurityNoEnc && !e.socialSecurityNoHash) {
          const ssnHash = cipher.blindIndex('social_security_no', cipher.decrypt(e.socialSecurityNoEnc));
          if (ssnHash) {
            if (await hashIsFree(tx, 'social_security_no', e.workspaceId, e.id, ssnHash)) {
              data.socialSecurityNoHash = ssnHash;
              report.socialSecurityHashed++;
            } else report.duplicates.push({ workspaceId: e.workspaceId, employeeId: e.id, field: 'socialSecurityNo' });
          }
        }
        if (Object.keys(data).length) await tx.employee.update({ where: { id: e.id }, data });
      }
      cursor = rows.at(-1)?.id;
      return rows.length < BATCH;
    });
    if (done) return report;
  }
};

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const env = loadEnv();
  const db = createDb(env.DATABASE_URL);
  backfillPii(db, createFieldCipher(env.ENCRYPTION_KEY))
    .then((r) => {
      console.warn(
        `PII backfill: scanned ${r.scanned}, encrypted ${r.encrypted} national IDs, hashed ${r.nationalIdHashed} national IDs and ${r.socialSecurityHashed} SSNs.`,
      );
      if (r.duplicates.length) {
        console.warn(`${r.duplicates.length} duplicate value(s) could not be indexed — fix these employees and re-run:`);
        for (const d of r.duplicates) console.warn(`  workspace ${d.workspaceId} · employee ${d.employeeId} · ${d.field}`);
        process.exitCode = 2;
      }
    })
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => db.disconnect());
}
