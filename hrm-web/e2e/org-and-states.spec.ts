import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, loginAsAdmin } from './fixtures';

test.describe('organisation & system states', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('org chart nests reports under their manager', async ({ page }) => {
    await page.goto('/org');
    const tree = page.getByRole('tree');
    await expect(tree.getByTestId('org-node').first()).toHaveText('ສົມສັກ ພົມມະວົງ');
    await expect(tree.getByText('ຄຳແພງ ແກ້ວມະນີ')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('settings: add a department', async ({ page }, info) => {
    const name = `QA ${info.project.name} ${Date.now() % 10000}`;
    await page.goto('/settings');
    const card = page.getByTestId('departments');
    await card.getByRole('textbox').fill(name);
    await card.getByRole('button', { name: 'ເພີ່ມ' }).click();
    await expect(card.getByText(name)).toBeVisible();
  });

  test('shows the offline state when the API is unreachable', async ({ page }) => {
    await page.route('**/api/v1/employees**', (route) => route.abort('internetdisconnected'));
    await page.goto('/employees');
    await expect(page.locator('[data-state="offline"]')).toBeVisible();
    await expect(page.getByText('ບໍ່ມີອິນເຕີເນັດ')).toBeVisible();
  });

  test('shows a not-found page for unknown routes', async ({ page }) => {
    await page.goto('/does-not-exist');
    await expect(page.locator('[data-state="notFound"]')).toBeVisible();
  });
});
