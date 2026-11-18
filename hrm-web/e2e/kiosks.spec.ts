import { expect, test, type APIRequestContext } from '@playwright/test';
import { DEMO, expectNoHorizontalScroll, loginAsAdmin } from './fixtures';

/** Same API the E2E web build talks to (see playwright.config.ts). */
const API = 'http://127.0.0.1:4100/api/v1';

/** A branch with KIOSK mode, unique per Playwright project (the seed has none). */
const kioskBranch = async (request: APIRequestContext, name: string) => {
  const login = await request.post(`${API}/auth/login`, {
    data: { workspaceCode: DEMO.workspaceCode, identifier: DEMO.admin.identifier, password: DEMO.admin.password },
  });
  const { accessToken } = (await login.json()) as { accessToken: string };
  const res = await request.post(`${API}/branches`, {
    headers: { authorization: `Bearer ${accessToken}` },
    data: { name, attendanceModes: ['KIOSK'] },
  });
  expect(res.ok()).toBeTruthy();
};

test.describe('kiosk devices (FR-ATT-03.1, FR-WS-06.3)', () => {
  test('HR enrols a kiosk, sees the code once, then revokes it', async ({ page, request }, info) => {
    const stamp = `${info.project.name} ${Date.now() % 100000}`;
    const branch = `Kiosk BR ${stamp}`;
    const name = `Tablet ${stamp}`;
    await kioskBranch(request, branch);

    await loginAsAdmin(page);
    await page.goto('/settings/kiosks');
    await expect(page.getByRole('heading', { name: 'ອຸປະກອນ Kiosk' })).toBeVisible();
    await page.getByTestId('kiosk-add').click();
    await page.locator('#kiosk-branch').selectOption({ label: branch });
    await page.locator('#kiosk-name').fill(name);
    await page.getByTestId('kiosk-enrol-submit').click();

    const code = (await page.getByTestId('kiosk-enrol-code').textContent())!.trim();
    expect(code.length).toBeGreaterThanOrEqual(43);
    await page.getByTestId('kiosk-code-done').click();
    const row = page.getByTestId('kiosk-row').filter({ hasText: name });
    await expect(row).toContainText(branch);
    await expect(row.getByTestId('kiosk-last-seen')).toHaveText('ຍັງບໍ່ເຄີຍເຊື່ອມຕໍ່');
    // The code is never shown again.
    await expect(page.getByText(code)).toHaveCount(0);
    await expectNoHorizontalScroll(page);

    // The tablet connects with the code: last seen is filled in.
    const me = await request.get(`${API}/kiosk/me`, { headers: { authorization: `Kiosk ${code}` } });
    expect(me.ok()).toBeTruthy();
    await page.reload();
    await expect(row.getByTestId('kiosk-last-seen')).not.toHaveText('ຍັງບໍ່ເຄີຍເຊື່ອມຕໍ່');

    await row.getByTestId('kiosk-revoke').click();
    await page.getByTestId('confirm-accept').click();
    await expect(page.getByTestId('kiosk-row').filter({ hasText: name })).toHaveCount(0);
    await page.locator('#kiosk-show-revoked').check();
    await expect(page.getByTestId('kiosk-row').filter({ hasText: name })).toContainText('ຖືກຖອນສິດ');
    const revoked = await request.get(`${API}/kiosk/me`, { headers: { authorization: `Kiosk ${code}` } });
    expect(revoked.status()).toBe(401);
  });
});
