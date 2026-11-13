import { expect, test } from '@playwright/test';
import { DEMO, expectNoHorizontalScroll, loginAsAdmin, loginWithPassword, loginWithPin } from './fixtures';

test.describe('login', () => {
  test('HR signs in with email + password and signs out', async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.getByTestId('stat-group')).not.toHaveText('—');
    await expectNoHorizontalScroll(page);
    await page.getByTestId('logout').click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('shows a translated error for wrong credentials', async ({ page }) => {
    await loginWithPassword(page, DEMO.admin.identifier, 'wrong-password1');
    await expect(page.getByTestId('login-error')).toHaveText('ຂໍ້ມູນເຂົ້າລະບົບບໍ່ຖືກຕ້ອງ');
  });

  test('validates fields before calling the API', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-form').getByRole('button', { name: 'ເຂົ້າສູ່ລະບົບ' }).click();
    await expect(page.getByText('ລະຫັດບໍລິສັດບໍ່ຖືກຕ້ອງ')).toBeVisible();
  });

  test('reveals and hides the password with the eye toggle', async ({ page }) => {
    await page.goto('/login');
    const password = page.locator('#password');
    await password.fill('Admin1234');
    await expect(password).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'ສະແດງລະຫັດ' }).click();
    await expect(password).toHaveAttribute('type', 'text');
    await expect(password).toHaveValue('Admin1234');
    await page.getByRole('button', { name: 'ເຊື່ອງລະຫັດ' }).click();
    await expect(password).toHaveAttribute('type', 'password');
  });

  test('field worker without email signs in with phone + PIN and sees no HR menus', async ({ page }) => {
    await loginWithPin(page, DEMO.fieldWorker.phone, DEMO.fieldWorker.pin);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('link', { name: 'ພະນັກງານ' })).toHaveCount(0);
    await page.goto('/employees');
    await expect(page.locator('[data-state="forbidden"]')).toBeVisible();
  });

  test('remembers the company code and protects private pages', async ({ page }) => {
    await page.goto('/employees');
    await expect(page).toHaveURL(/\/login/);
    await loginAsAdmin(page);
    await page.getByTestId('logout').click();
    await expect(page.locator('#workspaceCode')).toHaveValue(DEMO.workspaceCode);
  });

  test('switches language to English', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'EN' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });
});
