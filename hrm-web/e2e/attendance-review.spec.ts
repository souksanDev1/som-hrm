import { expect, test, type Page } from '@playwright/test';
import { DEMO, expectNoHorizontalScroll, loginAsAdmin, loginWithPin } from './fixtures';

/** Unique per project so desktop/tablet/mobile runs against the same seeded DB do not collide. */
const projectIndex = (name: string) => ({ desktop: 1, tablet: 2, mobile: 3 })[name] ?? 1;

/** Search E003 in the employee picker `selectId` and choose them. */
const pickFieldWorker = async (page: Page, selectId: string) => {
  const form = page.locator(`#${selectId}`).locator('xpath=..');
  await form.getByRole('searchbox').fill(DEMO.fieldWorker.identifier);
  await expect(page.locator(`#${selectId} option`, { hasText: DEMO.fieldWorker.identifier })).toHaveCount(1);
  const value = await page.locator(`#${selectId} option`, { hasText: DEMO.fieldWorker.identifier }).getAttribute('value');
  await page.locator(`#${selectId}`).selectOption(value!);
};

test.describe('HR attendance tools (FR-ATT-14, FR-ATT-04, FR-ATT-16.1, FR-ATT-11)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('reviews a suspicious punch: reject needs a note, then it leaves the queue', async ({ page }, info) => {
    const time = DEMO.suspiciousPunchTimes[projectIndex(info.project.name)]!;
    await page.goto('/attendance/review');
    // Match the capture time only (the receive time is the seed run's clock).
    const byTime = () => page.getByTestId('review-item').filter({ has: page.getByTestId('review-captured').filter({ hasText: ` ${time}` }) });
    const item = byTime();
    await expect(item).toHaveCount(1);
    await expectNoHorizontalScroll(page);
    await expect(item.getByTestId('review-reasons')).toContainText(/ເວລາໃນເຄື່ອງ|Device clock/);
    await expect(item.getByTestId('review-map')).toHaveAttribute('href', /google\.com\/maps\?q=/);
    await item.getByTestId('review-reject').click();
    await expect(item.getByRole('alert')).toBeVisible();
    await item.getByRole('textbox').fill(`Not at site (${info.project.name})`);
    await item.getByTestId('review-reject').click();
    await expect(byTime()).toHaveCount(0);
  });

  test('records a punch on behalf with a mandatory reason', async ({ page }, info) => {
    const n = projectIndex(info.project.name);
    await page.goto('/attendance/on-behalf');
    await page.getByTestId('on-behalf-submit').click();
    await expect(page.getByTestId('on-behalf-form').getByRole('alert').first()).toBeVisible();
    await pickFieldWorker(page, 'ob-employee');
    await page.locator('#ob-kind').selectOption('OUT');
    await page.locator('#ob-at').fill(`2026-01-0${n}T17:0${n}`);
    await page.locator('#ob-reason').fill(`Phone battery dead (${info.project.name})`);
    await page.getByTestId('on-behalf-submit').click();
    await expect(page.getByTestId('on-behalf-success')).toContainText(`2026-01-0${n} 17:0${n}`);
  });

  test('grants and revokes an off-site permission', async ({ page }, info) => {
    const n = projectIndex(info.project.name);
    const from = `2096-0${n}-01`;
    await page.goto('/attendance/offsite');
    await page.getByTestId('offsite-add').click();
    await pickFieldWorker(page, 'offsite-employee');
    await page.locator('#offsite-from').fill(from);
    await page.locator('#offsite-to').fill(`2096-0${n}-05`);
    await page.locator('#offsite-note').fill(`Client visit ${info.project.name}`);
    await page.getByTestId('offsite-save').click();
    const row = page.getByTestId('offsite-item').filter({ hasText: from });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(/ໃຊ້ໄດ້|Active/);
    await row.getByTestId('offsite-revoke').click();
    await page.getByTestId('confirm-accept').click();
    await expect(page.getByTestId('offsite-item').filter({ hasText: from })).toHaveCount(0);
  });

  test('shows the devices of an employee', async ({ page }) => {
    await page.goto('/attendance/devices');
    await pickFieldWorker(page, 'devices-employee');
    await expect(page.getByText(/ເຄື່ອງທີ່ຜູກໄວ້|Bound devices/)).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

test.describe('time correction (FR-ATT-19)', () => {
  test('the field worker files a correction and sees it pending', async ({ page }, info) => {
    const n = projectIndex(info.project.name);
    const day = `2025-0${n}-1${n}`;
    await loginWithPin(page, DEMO.fieldWorker.identifier, DEMO.fieldWorker.pin);
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto('/attendance/corrections');
    await page.getByTestId('correction-new').click();
    await page.locator('#corr-date').fill(day);
    await page.locator('#corr-in').fill('08:00');
    await page.locator('#corr-reason').fill(`Forgot to punch (${info.project.name})`);
    await page.getByTestId('correction-submit').click();
    const row = page.getByTestId('correction-item').filter({ hasText: day });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(/ລໍຖ້າອະນຸມັດ|Pending/);
    await expect(row).toContainText(`${day} 08:00`);
  });
});
