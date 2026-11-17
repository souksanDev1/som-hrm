import { expect, test, type Page } from '@playwright/test';
import { DEMO, expectNoHorizontalScroll, loginWithPassword, loginWithPin } from './fixtures';

/** Unique per project so desktop/tablet/mobile runs against the same seeded DB do not collide. */
const projectIndex = (name: string) => ({ desktop: 1, tablet: 2, mobile: 3 })[name] ?? 4;

/**
 * A future work date unique per project and (practically) per run: the E2E database keeps earlier runs' requests,
 * and a second request in the same period would be refused as overlapping.
 */
const uniqueWorkDate = (projectName: string) => {
  const base = Date.UTC(2080 + projectIndex(projectName) * 4, 0, 1);
  const offsetDays = Math.floor(Date.now() / 60_000) % 1400;
  return new Date(base + offsetDays * 86_400_000).toISOString().slice(0, 10);
};

const loginAsManager = async (page: Page) => {
  await loginWithPassword(page, DEMO.manager.identifier, DEMO.manager.password);
  await expect(page).toHaveURL(/\/dashboard/);
};

test.describe('overtime (FR-ATT-20..23)', () => {
  test('employee files OT with a live breakdown; manager approves it and sees it in the monthly report', async ({ page }, info) => {
    const workDate = uniqueWorkDate(info.project.name);
    const month = workDate.slice(0, 7);
    const tag = `E2E OT ${info.project.name} ${Date.now()}`;

    // E003 files a planned request (21:30 → 23:00 crosses the 22:00 night boundary).
    await loginWithPin(page, DEMO.fieldWorker.identifier, DEMO.fieldWorker.pin);
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto(`/overtime?month=${month}`);
    await expect(page.getByTestId('ot-approved')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.getByTestId('ot-new').click();
    const form = page.getByTestId('ot-form');
    await form.locator('#ot-workDate').fill(workDate);
    await form.locator('#ot-start').fill('21:30');
    await form.locator('#ot-end').fill('23:00');
    await form.locator('#ot-reason').fill(tag);
    await expect(form.getByTestId('ot-preview-split-total')).toHaveText('1:30');
    await expect(form.getByTestId('ot-preview-split-workdayNightMinutes')).toHaveText('1:00');
    await expect(form.getByTestId('ot-cap-day')).toBeVisible();
    await form.getByTestId('ot-submit').click();
    await expect(page.getByTestId('ot-submitted')).toBeVisible();
    const mine = page.getByTestId('ot-item').filter({ hasText: tag });
    await expect(mine).toHaveCount(1);
    await expect(mine).toContainText(/ລໍຖ້າອະນຸມັດ|Pending/);

    // The manager approves it from the inbox and finds it in the report.
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await loginAsManager(page);
    await page.goto(`/overtime/report?month=${month}`);
    const pending = page.getByTestId('ot-item').filter({ hasText: tag });
    await expect(pending).toHaveCount(1);
    await pending.getByRole('link').click();
    await expect(page).toHaveURL(/\/approvals\/[^/]+$/);
    await expect(page.getByTestId('approval-detail')).toContainText(tag);
    await page.getByTestId('approval-approve').click();
    await expect(page.getByTestId('approval-status')).toHaveText(/ອະນຸມັດແລ້ວ|Approved/);

    await page.goto(`/overtime/report?month=${month}`);
    await expect(page.getByTestId('ot-report-table')).toBeVisible();
    await expect(page.getByTestId('ot-report-row').filter({ hasText: 'E003' })).toBeVisible();
    await expect(page.getByTestId('ot-item').filter({ hasText: tag })).toContainText(/ອະນຸມັດແລ້ວ|Approved/);
    await expectNoHorizontalScroll(page);
  });

  test('blocks an OT period inside normal working hours', async ({ page }, info) => {
    await loginWithPin(page, DEMO.fieldWorker.identifier, DEMO.fieldWorker.pin);
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto('/overtime?new=1');
    const form = page.getByTestId('ot-form');
    // A weekday far in the future, during the standard 08:00–17:00 shift.
    const monday = new Date(Date.UTC(2079, 0, 2 + projectIndex(info.project.name) * 7)).toISOString().slice(0, 10);
    await form.locator('#ot-workDate').fill(monday);
    await form.locator('#ot-start').fill('10:00');
    await form.locator('#ot-end').fill('11:00');
    await expect(form.getByTestId('ot-preview-error')).toHaveText(/ນອກເວລາເຮັດວຽກປົກກະຕິ|outside normal working hours/);
    await expect(form.getByTestId('ot-submit')).toBeDisabled();
  });
});
