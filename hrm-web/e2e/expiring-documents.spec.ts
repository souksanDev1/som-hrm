import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, loginAsAdmin } from './fixtures';

/** Visible rows on desktop (table) or phones (cards). */
const rows = (page: Page) => page.locator('[data-testid="expiring-row"]:visible, [data-testid="expiring-card"]:visible');

test.describe('expiring documents overview (FR-EMP-06)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('lists the seeded foreign worker documents with API-computed status, expired in red', async ({ page }) => {
    // Seed (E004 Nguyen Van An): work permit +25 days, visa +55 days, medical certificate expired 10 days ago, passport +800 days.
    await page.goto('/documents/expiring');
    await expect(rows(page).filter({ hasText: 'Nguyen' }).first()).toBeVisible();
    await expect(page.locator('[data-expiry="EXPIRING"][data-threshold="30"]').first()).toBeVisible();
    const expired = page.locator('[data-expiry="EXPIRED"]:visible').first();
    await expect(expired).toHaveText('ໝົດອາຍຸແລ້ວ');
    await expect(expired.locator('..')).toHaveClass(/text-danger/);
    await expectNoHorizontalScroll(page);
  });

  test('filters by document type, status and branch through the URL', async ({ page }) => {
    await page.goto('/documents/expiring');
    await page.locator('#filter-type').selectOption('VISA');
    await expect(page).toHaveURL(/type=VISA/);
    await expect(rows(page).filter({ hasText: 'Nguyen' })).toHaveCount(1);
    await expect(page.locator('[data-expiry]:visible')).not.toHaveCount(0);
    for (const badge of await page.locator('[data-expiry]:visible').all()) await expect(badge).not.toHaveAttribute('data-expiry', 'VALID');

    await page.goto('/documents/expiring?status=EXPIRED');
    await expect(page.locator('#filter-status')).toHaveValue('EXPIRED');
    for (const badge of await page.locator('[data-expiry]:visible').all()) await expect(badge).toHaveAttribute('data-expiry', 'EXPIRED');

    // E004 works at the Pakse site; the head office has none of the seeded foreign-worker documents.
    await page.goto('/documents/expiring');
    await page.locator('#filter-branch').selectOption({ label: 'ສຳນັກງານໃຫຍ່ ວຽງຈັນ' });
    await expect(page).toHaveURL(/branchId=/);
    await expect(rows(page).filter({ hasText: 'Nguyen' })).toHaveCount(0);
  });

  test('opens the employee from a row', async ({ page }) => {
    await page.goto('/documents/expiring?type=WORK_PERMIT');
    await rows(page).filter({ hasText: 'Nguyen' }).first().getByRole('link').first().click();
    await expect(page).toHaveURL(/\/employees\/[^/]+$/);
    await expect(page.getByRole('heading', { name: 'Nguyen Van An' })).toBeVisible();
  });
});
