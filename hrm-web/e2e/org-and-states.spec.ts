import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, loginAsAdmin } from './fixtures';

test.describe('organisation & system states', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('org chart nests reports under their manager', async ({ page }) => {
    await page.goto('/org');
    const tree = page.getByRole('tree');
    // Other specs add top-level employees, so locate the seeded manager instead of relying on order.
    const manager = tree.getByRole('treeitem').filter({ has: page.getByTestId('org-node').getByText('ສົມສັກ ພົມມະວົງ', { exact: true }) }).first();
    await expect(manager).toBeVisible();
    await expect(manager.getByRole('treeitem').getByText('ສຸກສັນ ຈັນທະພອນ')).toBeVisible();
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
