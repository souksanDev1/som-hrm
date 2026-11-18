import { expect, test, type Page } from '@playwright/test';
import { DEMO, expectNoHorizontalScroll, loginWithPassword, loginWithPin } from './fixtures';

/** Unique per project so desktop/tablet/mobile runs against the same seeded DB do not collide. */
const projectIndex = (name: string) => ({ desktop: 1, tablet: 2, mobile: 3 })[name] ?? 4;

const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * A weekday 10–25 weeks ahead, unique per project and (practically) per run: the E2E database keeps earlier runs'
 * requests and an overlapping leave of the same employee is refused. Clear of the seeded requests (2–8 weeks ahead).
 */
const uniqueLeaveDate = (projectName: string) => {
  const day = new Date(`${isoToday()}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 70 + (projectIndex(projectName) - 1) * 35 + (Math.floor(Date.now() / 60_000) % 30));
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6) day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
};

const monthsBetween = (from: string, to: string) => (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7));

const switchUser = async (page: Page) => {
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
};

const loginAsFieldWorker = async (page: Page) => {
  await loginWithPin(page, DEMO.fieldWorker.identifier, DEMO.fieldWorker.pin);
  await expect(page).toHaveURL(/\/dashboard/);
};

const loginAsManager = async (page: Page) => {
  await loginWithPassword(page, DEMO.manager.identifier, DEMO.manager.password);
  await expect(page).toHaveURL(/\/dashboard/);
};

/** The manager approves the pending request whose summary contains `text`. */
const approveFromInbox = async (page: Page, text: string) => {
  await page.goto('/approvals');
  const row = page.getByTestId('approval-row').filter({ hasText: text });
  await expect(row).toHaveCount(1);
  await row.getByRole('link').click();
  await expect(page).toHaveURL(/\/approvals\/[^/]+$/);
  await expect(page.getByTestId('approval-detail')).toContainText(text);
  await page.getByTestId('approval-approve').click();
  await expect(page.getByTestId('approval-status')).toHaveText(/ອະນຸມັດແລ້ວ|Approved/);
};

test.describe('leave (FR-LV-03/06/12/13)', () => {
  test('employee files personal leave; manager approves; it shows on the calendar; the cancellation goes through approval', async ({ page }, info) => {
    const date = uniqueLeaveDate(info.project.name);
    const tag = `E2E leave ${info.project.name} ${Date.now()}`;

    // E003 files one day of personal leave with the live preview.
    await loginAsFieldWorker(page);
    await page.goto('/leave');
    await expect(page.getByTestId('leave-balances')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.getByTestId('leave-new').click();
    await expect(page).toHaveURL(/\/leave\/new/);
    const form = page.getByTestId('leave-form');
    const personal = form.getByTestId('leave-type').locator('option').filter({ hasText: /ລາກິດທຸລະ|Personal leave/ });
    await form.getByTestId('leave-type').selectOption(await personal.getAttribute('value'));
    await form.getByTestId('leave-start').fill(date);
    await expect(form.getByTestId('leave-end')).toHaveValue(date);
    await form.getByTestId('leave-reason').fill(tag);
    await expect(form.getByTestId('leave-preview-days')).toContainText('1');
    await expect(form.getByTestId('leave-preview-error')).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    const created = page.waitForResponse((r) => r.url().endsWith('/leave/requests') && r.request().method() === 'POST');
    await form.getByTestId('leave-submit').click();
    const response = await created;
    expect(response.status()).toBe(201);
    const { id } = (await response.json()) as { id: string };
    await expect(page.getByTestId('leave-submitted')).toBeVisible();

    // The manager approves it.
    await switchUser(page);
    await loginAsManager(page);
    await approveFromInbox(page, tag);

    // E003 sees it approved and on the month calendar.
    await switchUser(page);
    await loginAsFieldWorker(page);
    await page.goto(`/leave/${id}`);
    await expect(page.getByTestId('leave-detail-status')).toHaveText(/ອະນຸມັດແລ້ວ|Approved/);
    await page.goto('/leave/calendar');
    await expect(page.getByTestId('lcal-screen')).toBeVisible();
    await page.getByTestId('lcal-view-month').click();
    for (let i = 0; i < monthsBetween(isoToday(), date); i++) await page.getByTestId('lcal-next').click();
    const day = page.locator(`[data-testid="lcal-day"][data-date="${date}"]`);
    await expect(day).toBeVisible();
    await expect(day).not.toHaveAttribute('data-count', '0');
    await expectNoHorizontalScroll(page);

    // Cancelling approved leave needs a reason and the manager's approval (FR-LV-12.2).
    await page.goto(`/leave/${id}`);
    await page.getByTestId('leave-cancel').click();
    await page.getByTestId('leave-cancel-reason').fill(`${tag} cancel`);
    await page.getByTestId('leave-cancel-confirm').click();
    await expect(page.getByTestId('leave-cancel-pending')).toBeVisible();

    await switchUser(page);
    await loginAsManager(page);
    await approveFromInbox(page, `${tag} cancel`);

    await switchUser(page);
    await loginAsFieldWorker(page);
    await page.goto(`/leave/${id}`);
    await expect(page.getByTestId('leave-detail-status')).toHaveText(/ຍົກເລີກ|Cancelled/);
    await expect(page.getByTestId('leave-cancel-pending')).toHaveCount(0);
  });

  test('a pending request is withdrawn at once', async ({ page }, info) => {
    const date = uniqueLeaveDate(info.project.name);
    // A different weekday than the first test of this run: one week later.
    const later = new Date(`${date}T00:00:00Z`);
    later.setUTCDate(later.getUTCDate() + 7);
    const start = later.toISOString().slice(0, 10);

    await loginAsFieldWorker(page);
    await page.goto('/leave/new');
    const form = page.getByTestId('leave-form');
    const unpaid = form.getByTestId('leave-type').locator('option').filter({ hasText: /ລາບໍ່ຮັບເງິນເດືອນ|Unpaid leave/ });
    await form.getByTestId('leave-type').selectOption(await unpaid.getAttribute('value'));
    await form.getByTestId('leave-start').fill(start);
    await expect(form.getByTestId('leave-preview-days')).toBeVisible();
    const created = page.waitForResponse((r) => r.url().endsWith('/leave/requests') && r.request().method() === 'POST');
    await form.getByTestId('leave-submit').click();
    const { id } = (await (await created).json()) as { id: string };

    await page.goto(`/leave/${id}`);
    await expect(page.getByTestId('leave-detail-status')).toHaveText(/ລໍຖ້າອະນຸມັດ|Pending/);
    await page.getByTestId('leave-cancel').click();
    await page.getByTestId('leave-cancel-confirm').click();
    await expect(page.getByTestId('leave-detail-status')).toHaveText(/ຍົກເລີກ|Cancelled/);
  });
});
