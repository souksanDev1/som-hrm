import { expect, test } from '@playwright/test';
import { DEMO, loginAsAdmin, loginWithPin } from './fixtures';

/**
 * Notification center (FR-NOTI-04.1/04.2). The seed creates a document-expiry notification for the HR
 * demo user. Projects share one database, so assertions do not depend on its read state.
 */
test.describe('notification center', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('lists notifications, filters unread, marks all read and clears the badge', async ({ page }) => {
    await page.goto('/notifications');
    const rows = page.getByTestId('notification-row');
    await expect(rows.filter({ hasText: 'Nguyen Van An' }).first()).toBeVisible();

    await page.getByTestId('notif-mark-all').click();
    await page.getByTestId('notif-filter-unread').click();
    await expect(page.getByTestId('notification-row')).toHaveCount(0);
    await expect(page.locator('[data-testid="unread-badge"]:visible')).toHaveCount(0);

    await page.getByTestId('notif-filter-all').click();
    await expect(rows.first()).toBeVisible();
  });

  test('opens the linked screen when a notification is clicked', async ({ page }) => {
    await page.goto('/notifications');
    await page.getByTestId('notification-row').filter({ hasText: 'Nguyen Van An' }).first().getByRole('button').first().click();
    await expect(page).toHaveURL(/\/employees\/(?!new$)[^/]+$/);
    await expect(page.getByRole('heading', { name: /Nguyen Van An/ })).toBeVisible();
  });
});

/** Links resolve through the shared mapping (packages/shared `resolveNotificationLink`, FR-NOTI-04.2). */
test.describe('notification deep links', () => {
  test('a link without a web screen (own profile) marks the notification read and stays on the list', async ({ page }) => {
    // Seed: the field worker's own ID card expires in 20 days; that notification links to the mobile `/profile`.
    await loginWithPin(page, DEMO.fieldWorker.phone, DEMO.fieldWorker.pin);
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto('/notifications');
    const row = page.getByTestId('notification-row').filter({ hasText: /ບັດປະຈຳຕົວ/ }).first();
    await expect(row).toBeVisible();
    await row.getByRole('button').first().click();
    await expect(row).not.toHaveAttribute('data-unread', 'true');
    await expect(page).toHaveURL(/\/notifications$/);
  });
});

/** Per-workspace SMS switch (FR-NOTI-02.3) and the probation alert days (FR-NOTI-03.5) on the parameters page. */
test.describe('notification parameters', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('HR schedules turning SMS notifications on', async ({ page }, info) => {
    await page.goto('/settings/parameters');
    await expect(page.getByTestId('param-probation.alertDays').getByTestId('param-current')).toContainText('14, 7');
    const card = page.getByTestId('param-notification.smsEnabled');
    await expect(card.getByTestId('param-current')).toHaveText(/ປິດ|Off/);

    // A distinct future date per viewport project: they share one database.
    const effectiveFrom = `2097-0${['desktop', 'tablet', 'mobile'].indexOf(info.project.name) + 1}-15`;
    await card.getByRole('button', { name: /ກຳນົດການປ່ຽນແປງ|Schedule change/ }).click();
    const form = page.getByTestId('schedule-change-form');
    await form.locator('#param-value').selectOption('true');
    await form.locator('#param-effectiveFrom').fill(effectiveFrom);
    await form.locator('#param-reason').fill('E2E SMS');
    await form.getByRole('button', { name: /ບັນທຶກ|Save/ }).click();
    await expect(form).toBeHidden();
    const scheduled = card.getByTestId('param-scheduled');
    await expect(scheduled).toContainText(effectiveFrom);
    await expect(scheduled).toContainText(/ເປີດ|On/);
    // Today's value is unchanged until that date.
    await expect(card.getByTestId('param-current')).toHaveText(/ປິດ|Off/);
  });
});
