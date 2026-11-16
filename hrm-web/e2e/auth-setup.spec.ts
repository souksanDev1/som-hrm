import { expect, test, type APIRequestContext } from '@playwright/test';
import { DEMO, loginWithPassword } from './fixtures';

/** Same API the E2E web build talks to (see playwright.config.ts). */
const API = 'http://127.0.0.1:4100/api/v1';

/**
 * HR issues a temporary password through the API (as the web UI would), so each run gets a fresh
 * user flagged mustChangeCredential. No phone, so the SMS verification step does not apply.
 */
const issueTemporaryPassword = async (request: APIRequestContext) => {
  const login = await request.post(`${API}/auth/login`, {
    data: { workspaceCode: DEMO.workspaceCode, identifier: DEMO.admin.identifier, password: DEMO.admin.password },
  });
  expect(login.ok()).toBeTruthy();
  const { accessToken } = (await login.json()) as { accessToken: string };
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const email = `e2e-${suffix}@som.la`;
  const created = await request.post(`${API}/employees`, {
    headers: { authorization: `Bearer ${accessToken}` },
    data: {
      employeeCode: `X${suffix.slice(-8)}`, firstName: 'ທົດສອບ', lastName: 'E2E', gender: 'FEMALE', email,
      hireDate: '2025-01-01', employmentType: 'FULL_TIME', login: { method: 'PASSWORD' },
    },
  });
  expect(created.status()).toBe(201);
  const body = (await created.json()) as { credential: { temporarySecret: string } };
  return { email, temporaryPassword: body.credential.temporarySecret };
};

test.describe('account setup gate', () => {
  test('forces a user with a temporary password to change it before using the app', async ({ page, request }) => {
    const { email, temporaryPassword } = await issueTemporaryPassword(request);
    await loginWithPassword(page, email, temporaryPassword);
    await expect(page).toHaveURL(/\/account-setup/);
    await expect(page.getByTestId('setup-change-credential')).toBeVisible();

    // Every app page sends the user back to the setup screen.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/account-setup/);

    await page.locator('#currentPassword').fill(temporaryPassword);
    await page.locator('#newPassword').fill('short');
    await page.getByTestId('change-password-form').getByRole('button', { name: 'ບັນທຶກ' }).click();
    await expect(page.getByText('ລະຫັດຜ່ານຕ້ອງມີຢ່າງໜ້ອຍ 8 ຕົວ')).toBeVisible();

    await page.locator('#newPassword').fill('MyOwnPass9');
    await page.getByTestId('change-password-form').getByRole('button', { name: 'ບັນທຶກ' }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    // The new password works; the temporary one no longer does.
    await page.getByTestId('logout').click();
    await loginWithPassword(page, email, temporaryPassword);
    await expect(page.getByTestId('login-error')).toBeVisible();
    await loginWithPassword(page, email, 'MyOwnPass9');
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

test.describe('forgot password', () => {
  test('submits the request and shows the generic confirmation', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('forgot-link').click();
    await expect(page).toHaveURL(/\/forgot-password/);
    await page.locator('#workspaceCode').fill(DEMO.workspaceCode);
    await page.locator('#identifier').fill(DEMO.fieldWorker.identifier);
    await page.getByTestId('forgot-form').getByRole('button', { name: 'ສົ່ງລະຫັດ' }).click();
    await expect(page.getByTestId('forgot-sent')).toBeVisible();
    await expect(page.getByTestId('reset-form').locator('#code')).toBeVisible();

    // Unknown accounts get exactly the same answer.
    await page.goto('/forgot-password');
    await page.locator('#workspaceCode').fill(DEMO.workspaceCode);
    await page.locator('#identifier').fill('NO-SUCH-USER');
    await page.getByTestId('forgot-form').getByRole('button', { name: 'ສົ່ງລະຫັດ' }).click();
    await expect(page.getByTestId('forgot-sent')).toBeVisible();

    await page.getByTestId('back-to-login').click();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('language', () => {
  test('saves the language on the account and applies it at the next sign-in', async ({ page }) => {
    await loginWithPassword(page);
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto('/account');
    const saved = page.waitForResponse((r) => r.url().endsWith('/auth/me/locale') && r.status() === 204);
    await page.getByTestId('locale-en').click();
    await saved;
    await expect(page.getByRole('heading', { name: 'My account' })).toBeVisible();
    await page.getByTestId('logout').click();
    // Switch the login page back to Lao, then sign in: the saved English wins.
    await page.getByRole('button', { name: 'ລາວ' }).click();
    await loginWithPassword(page);
    await expect(page.getByTestId('logout')).toContainText('Sign out');
    // Restore Lao for the other specs.
    await page.goto('/account');
    const restored = page.waitForResponse((r) => r.url().endsWith('/auth/me/locale') && r.status() === 204);
    await page.getByTestId('locale-lo').click();
    await restored;
    await expect(page.getByRole('heading', { name: 'ບັນຊີຂອງຂ້ອຍ' })).toBeVisible();
  });
});
