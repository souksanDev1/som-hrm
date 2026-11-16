import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './fixtures';

test.describe('org settings', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('renames a branch, then deletes it after confirming', async ({ page }, info) => {
    const name = `BR ${info.project.name} ${Date.now() % 100000}`;
    await page.goto('/settings');
    const card = page.getByTestId('branches');
    await card.getByRole('textbox').fill(name);
    await card.getByRole('button', { name: 'ເພີ່ມ' }).click();
    await expect(card.getByText(name, { exact: true })).toBeVisible();

    await card.getByRole('button', { name: `ປ່ຽນຊື່ ${name}` }).click();
    await page.locator('#branches-rename').fill(`${name} 2`);
    await page.getByTestId('save-rename').click();
    await expect(card.getByText(`${name} 2`, { exact: true })).toBeVisible();

    await card.getByRole('button', { name: `ລຶບ ${name} 2` }).click();
    await page.getByTestId('confirm-cancel').click();
    await expect(card.getByText(`${name} 2`, { exact: true })).toBeVisible();
    await card.getByRole('button', { name: `ລຶບ ${name} 2` }).click();
    await page.getByTestId('confirm-accept').click();
    await expect(card.getByText(`${name} 2`, { exact: true })).toHaveCount(0);
  });

  test('settings is reachable from the mobile tab bar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dashboard');
    await page.getByRole('navigation', { name: 'mobile' }).getByRole('link', { name: 'ຕັ້ງຄ່າ' }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByTestId('branches')).toBeVisible();
  });
});
