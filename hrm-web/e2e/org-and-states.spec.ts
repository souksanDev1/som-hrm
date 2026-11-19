import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, loginAsAdmin } from './fixtures';

test.describe('organisation & system states', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('org chart shows Chairman → CEO → departments with heads, and the staff panel', async ({ page }) => {
    await page.goto('/org');
    const box = (text: string) => page.locator('[data-testid^="org-box-"]').filter({ has: page.getByText(text, { exact: true }) }).first();
    await expect(box('ປະທານ')).toBeVisible();
    await expect(box('CEO')).toBeVisible();
    // HR sits two levels down (under CEO) and is shown by default, with its head.
    const hr = box('ບຸກຄະລາກອນ (HR)');
    await expect(hr).toContainText('ສົມສັກ ພົມມະວົງ');
    await hr.getByRole('button', { name: 'ເບິ່ງລາຍຊື່ພະນັກງານ' }).click();
    const panel = page.getByTestId('org-detail-panel');
    await expect(panel.getByRole('listitem').first()).toContainText('ສົມສັກ ພົມມະວົງ');
    await expect(panel.getByRole('listitem').first()).toContainText('ຫົວໜ້າ');
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expectNoHorizontalScroll(page);
  });

  test('manage page: a sub-unit added under CEO appears on the chart', async ({ page }, info) => {
    const name = `UNIT ${info.project.name} ${Date.now() % 100000}`;
    await page.goto('/org/manage');
    const row = (text: string) => page.locator('[data-testid^="dept-row-"]').filter({ has: page.getByText(text, { exact: true }) }).first();
    await row('CEO').getByRole('button', { name: 'ເພີ່ມໜ່ວຍງານຍ່ອຍ' }).click();
    await page.locator('#department-form-name').fill(name);
    await page.getByTestId('department-form-save').click();
    await expect(page.getByTestId('department-form-save')).toBeHidden();
    await expect(row(name)).toBeVisible();

    await page.goto('/org');
    await expect(page.locator('[data-testid^="org-box-"]').filter({ hasText: name })).toBeVisible();

    await page.goto('/org/manage');
    await row(name).getByRole('button', { name: 'ລຶບ' }).click();
    await page.getByTestId('confirm-accept').click();
    await expect(row(name)).toHaveCount(0);
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
