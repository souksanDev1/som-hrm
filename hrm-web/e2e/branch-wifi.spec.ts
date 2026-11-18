import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, loginAsAdmin } from './fixtures';

/** FR-ATT-12 (SHOULD): HR lists the branch's office Wi-Fi networks, one per line. */
test.describe('branch Wi-Fi', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('saves the Wi-Fi list, shows it again on edit and validates long entries', async ({ page }, info) => {
    const name = `WIFI ${info.project.name} ${Date.now() % 100000}`;
    await page.goto('/settings');
    const card = page.getByTestId('branches');
    await card.getByRole('textbox').fill(name);
    await card.getByRole('button', { name: 'ເພີ່ມ' }).click();
    await expect(card.getByText(name, { exact: true })).toBeVisible();

    await card.getByRole('button', { name: `ແກ້ໄຂ ${name}` }).click();
    const wifi = page.locator('#branch-form-wifiNetworks');
    await wifi.fill('x'.repeat(65));
    await page.getByTestId('branch-form-save').click();
    await expect(wifi).toHaveAttribute('aria-invalid', 'true');

    await wifi.fill(' SOM-Office \n\naa:bb:cc:dd:ee:01\nSOM-Office');
    await page.getByTestId('branch-form-save').click();
    await expect(page.getByTestId('branch-form-save')).toBeHidden();
    await expectNoHorizontalScroll(page);

    await card.getByRole('button', { name: `ແກ້ໄຂ ${name}` }).click();
    await expect(page.locator('#branch-form-wifiNetworks')).toHaveValue('SOM-Office\naa:bb:cc:dd:ee:01');
    await page.locator('#branch-form-wifiNetworks').fill('');
    await page.getByTestId('branch-form-save').click();
    await expect(page.getByTestId('branch-form-save')).toBeHidden();

    await card.getByRole('button', { name: `ລຶບ ${name}` }).click();
    await page.getByTestId('confirm-accept').click();
    await expect(card.getByText(name, { exact: true })).toHaveCount(0);
  });
});
