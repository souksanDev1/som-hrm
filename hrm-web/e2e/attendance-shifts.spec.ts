import { expect, test } from '@playwright/test';
import { DEMO, expectNoHorizontalScroll, loginAsAdmin, loginWithPassword } from './fixtures';

/** Unique data per project so parallel desktop/tablet/mobile runs never collide. */
const SUFFIX: Record<string, string> = { desktop: 'D', tablet: 'T', mobile: 'M' };
/** Weeks ahead of the current one used for the roster, per project. */
const WEEKS_AHEAD: Record<string, number> = { desktop: 20, tablet: 21, mobile: 22 };

test.describe('shifts, roster and attendance report (FR-ATT-17/18)', () => {
  test('HR creates a night shift, edits it, and deleting an unused shift removes it', async ({ page }, info) => {
    const suffix = SUFFIX[info.project.name] ?? 'X';
    await loginAsAdmin(page);
    await page.goto('/settings/shifts');
    await expect(page.getByTestId('shift-list')).toBeVisible();

    const name = `ກະກາງຄືນ E2E ${suffix} ${Date.now()}`;
    await page.getByTestId('shift-add').click();
    await page.locator('#shift-form-name').fill(name);
    await page.locator('#shift-form-code').fill(`N${suffix}`);
    await page.locator('#shift-form-color').fill('#1E3A8A');
    await page.locator('#shift-form-startTime').fill('22:00');
    await page.locator('#shift-form-endTime').fill('06:00');
    await page.locator('#shift-form-breakMinutes').fill('60');
    await page.getByTestId('shift-form-save').click();
    const row = page.getByTestId('shift-row').filter({ hasText: name });
    await expect(row).toContainText('22:00–06:00');
    await expect(row).toContainText('ກະກາງຄືນ');

    // Client-side validation mirrors the API (validateShift): equal start/end is refused.
    await row.getByRole('button', { name: new RegExp(`ແກ້ໄຂ ${name}`) }).click();
    await page.locator('#shift-form-endTime').fill('22:00');
    await page.getByTestId('shift-form-save').click();
    await expect(page.locator('#shift-form-endTime')).toHaveAttribute('aria-invalid', 'true');
    await page.locator('#shift-form-endTime').fill('07:00');
    await page.getByTestId('shift-form-save').click();
    await expect(row).toContainText('22:00–07:00');

    await row.getByRole('button', { name: new RegExp(`ລຶບ ${name}`) }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'ລຶບ' }).click();
    await expect(page.getByTestId('shift-notice')).toContainText('ລຶບກະແລ້ວ');
    await expect(page.getByTestId('shift-row').filter({ hasText: name })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });

  test('HR rosters a rest day for a future week and bulk-fills a range back to the schedule', async ({ page }, info) => {
    const weeks = WEEKS_AHEAD[info.project.name] ?? 23;
    await loginAsAdmin(page);
    await page.goto('/attendance/roster');
    await expect(page.getByTestId('roster-grid')).toBeVisible();
    for (let i = 0; i < weeks; i++) await page.getByRole('button', { name: 'ອາທິດໜ້າ' }).click();
    const week = (await page.getByTestId('roster-week').innerText()).trim();
    const monday = week.slice(0, 10);

    const cell = page.getByTestId(`roster-cell-E003-${monday}`);
    await expect(cell).toHaveValue('SCHEDULE');
    await cell.selectOption('REST');
    await expect(page.getByTestId('roster-notice')).toContainText('1');
    await expect(cell).toHaveValue('REST');

    // Bulk: whole week for E003 back to the work schedule.
    await page.getByLabel(/^E003 ·/).check();
    await page.locator('#roster-bulk-shift').selectOption('SCHEDULE');
    await page.getByTestId('roster-bulk-apply').click();
    await expect(cell).toHaveValue('SCHEDULE');
    await expectNoHorizontalScroll(page);
  });

  test('the daily attendance page filters by status; managers see it too', async ({ page }) => {
    await loginWithPassword(page, DEMO.manager.identifier, DEMO.manager.password);
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto('/attendance');
    await expect(page.locator('#attendance-date')).toBeVisible();
    await page.locator('#attendance-status').selectOption('ABSENT');
    // Either the table (only ABSENT rows) or the empty state.
    const rows = page.getByTestId('attendance-day-row');
    for (const r of await rows.all()) await expect(r).toHaveAttribute('data-status', 'ABSENT');
    await page.getByRole('button', { name: 'ການລົງເວລາຂອງຂ້ອຍ' }).click();
    await expect(page).toHaveURL(/\/attendance\/employees\/[^/]+$/);
    await expect(page.getByTestId('attendance-summary')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
