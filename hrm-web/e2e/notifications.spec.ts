import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './fixtures';

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
