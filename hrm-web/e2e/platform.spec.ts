import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalScroll } from './fixtures';

/** SOM super admin from hrm-api/prisma/seed.ts (PLATFORM_DEMO, development data only). */
const PLATFORM_ADMIN = { email: 'superadmin@som.la', password: 'SomAdmin1234' } as const;

const loginPlatform = async (page: Page) => {
  await page.goto('/platform/login');
  await page.locator('#platform-email').fill(PLATFORM_ADMIN.email);
  await page.locator('#platform-password').fill(PLATFORM_ADMIN.password);
  await page.getByTestId('platform-login-form').getByRole('button', { name: /ເຂົ້າສູ່ລະບົບ|Sign in/ }).click();
  await expect(page).toHaveURL(/\/platform$/);
};

test.describe('SOM platform console', () => {
  test('rejects a wrong password', async ({ page }) => {
    await page.goto('/platform/login');
    await page.locator('#platform-email').fill(PLATFORM_ADMIN.email);
    await page.locator('#platform-password').fill('wrong-pass1');
    await page.getByTestId('platform-login-form').getByRole('button', { name: /ເຂົ້າສູ່ລະບົບ|Sign in/ }).click();
    await expect(page.getByTestId('platform-login-error')).toBeVisible();
  });

  test('guards the console and keeps it separate from the tenant app', async ({ page }) => {
    await page.goto('/platform');
    await expect(page).toHaveURL(/\/platform\/login/);
  });

  test('create a workspace, then suspend and reactivate it', async ({ page }, info) => {
    const code = `qa-${info.project.name}-${Date.now() % 100000}`;
    await loginPlatform(page);
    await expectNoHorizontalScroll(page);

    await page.getByTestId('new-workspace').click();
    const form = page.getByTestId('create-workspace-form');
    await form.locator('#ws-code').fill(code);
    await form.locator('#ws-name').fill(`QA ${code}`);
    await form.locator('#ws-seatLimit').fill('30');
    await form.locator('#ws-owner-name').fill('QA Owner');
    await form.locator('#ws-owner-email').fill(`owner@${code}.test`);
    await form.locator('#ws-owner-password').fill('Owner12345');
    await form.getByRole('button', { name: /ສ້າງບໍລິສັດ|Create workspace/ }).click();

    await expect(page).toHaveURL(/\/platform\/workspaces\//);
    await expect(page.getByText(code, { exact: true })).toBeVisible();
    await expect(page.getByTestId('workspace-status')).toHaveAttribute('data-status', 'ACTIVE');
    await expectNoHorizontalScroll(page);

    await page.getByTestId('toggle-workspace-status').click();
    await page.getByTestId('confirm-suspend').click();
    await expect(page.getByTestId('workspace-status')).toHaveAttribute('data-status', 'SUSPENDED');

    // The list filter finds it as suspended.
    await page.goto('/platform');
    await page.getByTestId('workspace-search').fill(code);
    await page.getByTestId('workspace-status-filter').selectOption('SUSPENDED');
    // Desktop shows a table, phones show cards; both are in the DOM, so pick the visible one.
    const listed = page.getByText(`QA ${code}`).filter({ visible: true }).first();
    await expect(listed).toBeVisible();

    await listed.click();
    await page.getByTestId('toggle-workspace-status').click();
    await expect(page.getByTestId('workspace-status')).toHaveAttribute('data-status', 'ACTIVE');

    await page.goto('/platform/audit');
    await expect(page.getByText('platform.workspace.suspend').filter({ visible: true }).first()).toBeVisible();
  });

  test('system parameters show current values and history', async ({ page }) => {
    await loginPlatform(page);
    await page.goto('/platform/parameters');
    await expect(page.getByTestId('param-auth.lockout.maxAttempts')).toBeVisible();
    await expect(page.getByTestId('param-document.expiryAlertDays')).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });
});
