import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { CreateEmployeeResponse, EmployeeDetail, StoredFileRef } from '@hrm/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { detectDocumentFileType } from '../src/modules/files/file-type';
import {
  api, bearer, createTestContext, createUser, createWorkspace, employeePayload, loginAs, OWNER_PASSWORD,
  type TestContext, type WorkspaceFixture,
} from './helpers';

const MAX_BYTES = 64 * 1024;
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), randomBytes(200), Buffer.from('\n%%EOF')]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(100)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(100)]);

let t: TestContext;
let storageDir: string;
beforeAll(async () => {
  storageDir = await mkdtemp(path.join(tmpdir(), 'hrm-files-'));
  t = await createTestContext({ FILE_STORAGE_DIR: storageDir, FILE_MAX_BYTES: String(MAX_BYTES) });
});
afterAll(async () => {
  await t.close();
  await rm(storageDir, { recursive: true, force: true });
});

/** Hand-built multipart body: app.inject has no FormData support. */
const multipart = (fileName: string, content: Buffer, contentType = 'application/octet-stream') => {
  const boundary = `----hrm${randomBytes(8).toString('hex')}`;
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${contentType}\r\n\r\n`),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
};

const ownerSession = async (ws: WorkspaceFixture) => (await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD)).accessToken;

const upload = (token: string, employeeId: string, docId: string, fileName: string, content: Buffer, contentType?: string) => {
  const { payload, headers } = multipart(fileName, content, contentType);
  return t.app.inject({ method: 'PUT', url: api(`/employees/${employeeId}/documents/${docId}/file`), headers: { ...bearer(token), ...headers }, payload });
};
const download = (token: string, employeeId: string, docId: string) =>
  t.app.inject({ method: 'GET', url: api(`/employees/${employeeId}/documents/${docId}/file`), headers: bearer(token) });

/** Workspace with an employee who has one document. */
const setup = async () => {
  const ws = await createWorkspace(t.db);
  const token = await ownerSession(ws);
  const employee = (
    await t.app.inject({ method: 'POST', url: api('/employees'), headers: bearer(token), payload: employeePayload() })
  ).json<CreateEmployeeResponse>().employee;
  const detail = (
    await t.app.inject({
      method: 'POST', url: api(`/employees/${employee.id}/documents`), headers: bearer(token),
      payload: { type: 'CONTRACT', number: 'C-1' },
    })
  ).json<EmployeeDetail>();
  return { ws, token, employeeId: employee.id, docId: detail.documents[0]!.id };
};

describe('file type detection', () => {
  it('recognises PDF, PNG and JPEG by magic bytes only', () => {
    expect(detectDocumentFileType(PDF)?.mimeType).toBe('application/pdf');
    expect(detectDocumentFileType(PNG)?.mimeType).toBe('image/png');
    expect(detectDocumentFileType(JPG)?.mimeType).toBe('image/jpeg');
    expect(detectDocumentFileType(Buffer.from('GIF89a....'))).toBeNull();
    expect(detectDocumentFileType(Buffer.from([0xff]))).toBeNull();
  });
});

describe('employee document files', () => {
  it('uploads a PDF, exposes it on the document and downloads the same bytes', async () => {
    const { ws, token, employeeId, docId } = await setup();
    const res = await upload(token, employeeId, docId, 'ສັນຍາ contract.pdf', PDF, 'application/pdf');
    expect(res.statusCode).toBe(200);
    const file = res.json<StoredFileRef>();
    expect(file).toMatchObject({ originalName: 'ສັນຍາ contract.pdf', mimeType: 'application/pdf', sizeBytes: PDF.length });

    const detail = (await t.app.inject({ method: 'GET', url: api(`/employees/${employeeId}`), headers: bearer(token) })).json<EmployeeDetail>();
    expect(detail.documents[0]!.file).toEqual(file);

    const dl = await download(token, employeeId, docId);
    expect(dl.statusCode).toBe(200);
    expect(dl.headers['content-type']).toBe('application/pdf');
    expect(dl.headers['content-disposition']).toContain("filename*=UTF-8''");
    expect(Buffer.compare(dl.rawPayload, PDF)).toBe(0);

    const stored = await t.db.tenant(ws.workspaceId, (tx) => tx.storedFile.findUniqueOrThrow({ where: { id: file.id } }));
    expect(stored.storageKey).toBe(`${ws.workspaceId}/EMPLOYEE_DOCUMENT/${file.id}`);
    expect(stored.sha256).toMatch(/^[0-9a-f]{64}$/);
    const audit = await t.db.tenant(ws.workspaceId, (tx) => tx.auditLog.findFirst({ where: { action: 'employee.document_file_uploaded', entityId: docId } }));
    expect(audit).not.toBeNull();
  });

  it('removes the stored file row and bytes when the document is deleted', async () => {
    const { ws, token, employeeId, docId } = await setup();
    const file = (await upload(token, employeeId, docId, 'contract.pdf', PDF)).json<StoredFileRef>();
    const blob = path.join(storageDir, ws.workspaceId, 'EMPLOYEE_DOCUMENT', file.id);
    await expect(stat(blob)).resolves.toBeTruthy();

    const res = await t.app.inject({ method: 'DELETE', url: api(`/employees/${employeeId}/documents/${docId}`), headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    const row = await t.db.tenant(ws.workspaceId, (tx) => tx.storedFile.findUnique({ where: { id: file.id } }));
    expect(row).toBeNull();
    await expect(stat(blob)).rejects.toThrow();
  });

  it('accepts PNG and JPEG and replaces the previous file', async () => {
    const { ws, token, employeeId, docId } = await setup();
    const first = (await upload(token, employeeId, docId, 'scan.png', PNG)).json<StoredFileRef>();
    expect(first.mimeType).toBe('image/png');
    const second = await upload(token, employeeId, docId, 'scan.jpg', JPG);
    expect(second.statusCode).toBe(200);
    expect(second.json<StoredFileRef>().mimeType).toBe('image/jpeg');

    const rows = await t.db.tenant(ws.workspaceId, (tx) => tx.storedFile.findMany({ where: { workspaceId: ws.workspaceId } }));
    expect(rows.map((r) => r.id)).toEqual([second.json<StoredFileRef>().id]);
    const dl = await download(token, employeeId, docId);
    expect(dl.headers['content-type']).toBe('image/jpeg');
    expect(Buffer.compare(dl.rawPayload, JPG)).toBe(0);
  });

  it('rejects files whose bytes are not PDF/JPEG/PNG even when the name and type claim so', async () => {
    const { token, employeeId, docId } = await setup();
    const res = await upload(token, employeeId, docId, 'evil.pdf', Buffer.from('<html><script>alert(1)</script></html>'), 'application/pdf');
    expect(res.statusCode).toBe(415);
    expect(res.json().error.code).toBe('unsupported_file_type');
  });

  it('rejects oversize and empty uploads, and requests without a file', async () => {
    const { token, employeeId, docId } = await setup();
    const big = Buffer.concat([PDF, Buffer.alloc(MAX_BYTES)]);
    const tooBig = await upload(token, employeeId, docId, 'big.pdf', big);
    expect(tooBig.statusCode).toBe(413);
    expect(tooBig.json().error.code).toBe('file_too_large');

    const empty = await upload(token, employeeId, docId, 'empty.pdf', Buffer.alloc(0));
    expect(empty.statusCode).toBe(400);
    expect(empty.json().error.code).toBe('file_required');

    const json = await t.app.inject({
      method: 'PUT', url: api(`/employees/${employeeId}/documents/${docId}/file`), headers: bearer(token), payload: { file: 'x' },
    });
    expect(json.statusCode).toBe(400);
    expect(json.json().error.code).toBe('file_required');
  });

  it('returns 404 for unknown documents and for documents of another workspace', async () => {
    const a = await setup();
    const b = await setup();
    expect((await upload(a.token, a.employeeId, 'nope', 'x.pdf', PDF)).statusCode).toBe(404);
    // B's token cannot touch A's document (RLS + workspace filter).
    expect((await upload(b.token, a.employeeId, a.docId, 'x.pdf', PDF)).statusCode).toBe(404);
    await upload(a.token, a.employeeId, a.docId, 'x.pdf', PDF);
    expect((await download(b.token, a.employeeId, a.docId)).statusCode).toBe(404);
    // Document without a file.
    expect((await download(b.token, b.employeeId, b.docId)).json().error.code).toBe('file_missing');
  });

  it('enforces permissions: upload needs employee.write; download is limited to the data scope or oneself', async () => {
    const { ws, token, employeeId, docId } = await setup();
    await upload(token, employeeId, docId, 'x.pdf', PDF);
    const other = (
      await t.app.inject({ method: 'POST', url: api('/employees'), headers: bearer(token), payload: employeePayload() })
    ).json<CreateEmployeeResponse>().employee;

    await createUser(t.db, ws, { email: 'self@x.test', password: 'Employee123', role: 'EMPLOYEE', employeeId });
    await createUser(t.db, ws, { email: 'peer@x.test', password: 'Employee123', role: 'EMPLOYEE', employeeId: other.id });
    const self = (await loginAs(t.app, ws.code, 'self@x.test', 'Employee123')).accessToken;
    const peer = (await loginAs(t.app, ws.code, 'peer@x.test', 'Employee123')).accessToken;

    const denied = await upload(self, employeeId, docId, 'x.pdf', PDF);
    expect(denied.statusCode).toBe(403);
    expect((await download(self, employeeId, docId)).statusCode).toBe(200);
    expect((await download(peer, employeeId, docId)).statusCode).toBe(404);
  });
});
