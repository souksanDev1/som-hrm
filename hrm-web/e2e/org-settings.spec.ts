import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, loginAsAdmin } from './fixtures';

test.describe('org settings', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('edits a branch name and GPS geofence, then deletes it after confirming', async ({ page }, info) => {
    const name = `BR ${info.project.name} ${Date.now() % 100000}`;
    await page.goto('/settings');
    const card = page.getByTestId('branches');
    await card.getByRole('textbox').fill(name);
    await card.getByRole('button', { name: 'ເພີ່ມ' }).click();
    await expect(card.getByText(name, { exact: true })).toBeVisible();

    await card.getByRole('button', { name: `ແກ້ໄຂ ${name}` }).click();
    await page.locator('#branch-form-name').fill(`${name} 2`);
    // Half a geofence is rejected before calling the API.
    await page.locator('#branch-form-latitude').fill('17.9757');
    await page.getByTestId('branch-form-save').click();
    await expect(page.locator('#branch-form-longitude')).toHaveAttribute('aria-invalid', 'true');
    await page.locator('#branch-form-longitude').fill('102.6331');
    await page.locator('#branch-form-geofenceRadius').fill('200');
    await page.getByTestId('branch-form-save').click();
    await expect(page.getByTestId('branch-form-save')).toBeHidden();
    const row = card.getByTestId('org-entity-row').filter({ hasText: `${name} 2` });
    await expect(row).toContainText('GPS 200');
    await expectNoHorizontalScroll(page);

    await card.getByRole('button', { name: `ລຶບ ${name} 2` }).click();
    await page.getByTestId('confirm-cancel').click();
    await expect(card.getByText(`${name} 2`, { exact: true })).toBeVisible();
    await card.getByRole('button', { name: `ລຶບ ${name} 2` }).click();
    await page.getByTestId('confirm-accept').click();
    await expect(card.getByText(`${name} 2`, { exact: true })).toHaveCount(0);
  });

  test('closes a position (hidden by default, kept as closed) and reopens it', async ({ page }, info) => {
    const name = `POS ${info.project.name} ${Date.now() % 100000}`;
    await page.goto('/settings');
    const card = page.getByTestId('positions');
    await card.getByRole('textbox').fill(name);
    await card.getByRole('button', { name: 'ເພີ່ມ' }).click();
    await expect(card.getByText(name, { exact: true })).toBeVisible();

    await card.getByRole('button', { name: `ປິດ ${name}` }).click();
    await page.getByTestId('confirm-accept').click();
    await expect(card.getByText(name, { exact: true })).toHaveCount(0);

    await page.getByLabel('ສະແດງລາຍການທີ່ປິດແລ້ວ').check();
    const row = card.getByTestId('org-entity-row').filter({ hasText: name });
    await expect(row).toContainText('ປິດແລ້ວ');
    await card.getByRole('button', { name: `ເປີດຄືນ ${name}` }).click();
    await expect(row).not.toContainText('ປິດແລ້ວ');
  });

  test('settings is reachable from the mobile tab bar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dashboard');
    await page.getByRole('navigation', { name: 'mobile' }).getByRole('link', { name: 'ຕັ້ງຄ່າ' }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByTestId('branches')).toBeVisible();
  });
});
