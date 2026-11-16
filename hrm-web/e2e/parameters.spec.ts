import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, loginAsAdmin } from './fixtures';

test.describe('workspace business parameters', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('schedule a future change and see field errors from validation', async ({ page }) => {
    await page.goto('/settings/parameters');
    const card = page.getByTestId('param-approval.escalationWorkingDays');
    await expect(card.getByTestId('param-current')).toBeVisible();
    await expectNoHorizontalScroll(page);

    await card.getByRole('button', { name: /ກຳນົດການປ່ຽນແປງ|Schedule change/ }).click();
    const form = page.getByTestId('schedule-change-form');

    // Out of range → message under the value field.
    await form.locator('#param-value').fill('99');
    await form.locator('#param-reason').fill('QA');
    await form.getByRole('button', { name: /ບັນທຶກ|Save/ }).click();
    await expect(form.locator('#param-value')).toHaveAttribute('aria-invalid', 'true');
    await expect(form.getByText(/ຂອບເຂດ|range/)).toBeVisible();

    // Valid future change → listed as scheduled; today's value is unchanged.
    await form.locator('#param-value').fill('3');
    await form.locator('#param-effectiveFrom').fill('2099-01-01');
    await form.getByRole('button', { name: /ບັນທຶກ|Save/ }).click();
    await expect(form).toBeHidden();
    await expect(card.getByTestId('param-scheduled')).toContainText('2099-01-01');
  });

  test('system parameters are not listed for a workspace', async ({ page }) => {
    await page.goto('/settings/parameters');
    await expect(page.getByTestId('param-document.expiryAlertDays')).toBeVisible();
    await expect(page.getByTestId('param-otp.length')).toHaveCount(0);
  });
});
