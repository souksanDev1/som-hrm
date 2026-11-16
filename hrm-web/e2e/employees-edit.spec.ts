import { expect, test, type Page } from '@playwright/test';
import { loginAsAdmin } from './fixtures';

/** Create a throw-away employee through the UI and return to its detail page. */
const createEmployee = async (page: Page, code: string, extra: (page: Page) => Promise<void> = async () => undefined) => {
  await page.goto('/employees/new');
  await page.locator('#employeeCode').fill(code);
  await page.locator('#firstName').fill('ທົດສອບ');
  await page.locator('#lastName').fill(code);
  await page.locator('#hireDate').fill('2026-01-05');
  await extra(page);
  await page.getByTestId('employee-submit').click();
  await expect(page).toHaveURL(/\/employees\/[^/]+$/);
};

test.describe('employee edit, contacts, history and document delete', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('clears an optional field on edit (PATCH sends null)', async ({ page }, info) => {
    const code = `C${info.project.name.slice(0, 1).toUpperCase()}${Date.now() % 100000}`;
    await createEmployee(page, code, async (p) => {
      await p.locator('#address').fill('ບ້ານ ທົດສອບ');
      await p.locator('#email').fill(`${code.toLowerCase()}@e2e.test`);
    });
    await expect(page.getByText(`${code.toLowerCase()}@e2e.test`)).toBeVisible();

    await page.getByRole('link', { name: /ແກ້ໄຂ|Edit/ }).click();
    const patch = page.waitForRequest((r) => r.method() === 'PATCH' && r.url().includes('/employees/'));
    await page.locator('#email').fill('');
    await page.getByTestId('employee-submit').click();
    expect((await patch).postDataJSON()).toEqual({ email: null });
    await expect(page).toHaveURL(/\/employees\/[^/]+$/);
    await expect(page.getByText(`${code.toLowerCase()}@e2e.test`)).toHaveCount(0);
    await expect(page.getByText('ບ້ານ ທົດສອບ')).toBeVisible(); // untouched field kept
  });

  test('records a status change in the employment history', async ({ page }, info) => {
    const code = `H${info.project.name.slice(0, 1).toUpperCase()}${Date.now() % 100000}`;
    await createEmployee(page, code);
    await page.getByRole('link', { name: /ແກ້ໄຂ|Edit/ }).click();
    await page.locator('#status').selectOption('ACTIVE');
    await page.locator('#effectiveDate').fill('2026-02-01');
    await page.getByTestId('employee-submit').click();
    await expect(page).toHaveURL(/\/employees\/[^/]+$/);
    const rows = page.getByTestId('history-card').getByTestId('history-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('2026-02-01');
  });

  test('adds, edits and removes an emergency contact with confirmation', async ({ page }, info) => {
    await createEmployee(page, `K${info.project.name.slice(0, 1).toUpperCase()}${Date.now() % 100000}`);
    await page.getByTestId('add-contact').click();
    await page.locator('#contact-name').fill('ນາງ ດາ');
    await page.locator('#contact-relationship').fill('ແມ່');
    await page.locator('#contact-phone').fill('020 5555 9191');
    await page.getByTestId('save-contact').click();
    await expect(page.getByTestId('contact-row')).toHaveCount(1);
    await page.getByTestId('edit-contact').click();
    await expect(page.locator('#contact-relationship')).toHaveValue('ແມ່');
    await page.locator('#contact-relationship').fill('ພໍ່');
    const patch = page.waitForRequest((r) => r.method() === 'PATCH' && r.url().includes('/emergency-contacts/'));
    await page.getByTestId('save-contact').click();
    expect((await patch).postDataJSON()).toMatchObject({ relationship: 'ພໍ່' });
    await expect(page.getByTestId('contact-row')).toContainText('ພໍ່');
    await page.getByTestId('remove-contact').click();
    await page.getByTestId('confirm-accept').click();
    await expect(page.getByTestId('contact-row')).toHaveCount(0);
  });

  test('deleting a document asks for confirmation first', async ({ page }, info) => {
    await createEmployee(page, `D${info.project.name.slice(0, 1).toUpperCase()}${Date.now() % 100000}`);
    await page.getByTestId('add-document').click();
    await page.locator('#doc-number').fill('DEL-E2E');
    await page.getByTestId('save-document').click();
    await expect(page.getByTestId('document-row')).toHaveCount(1);

    await page.getByTestId('delete-document').click();
    await page.getByTestId('confirm-cancel').click();
    await expect(page.getByTestId('document-row')).toHaveCount(1);

    await page.getByTestId('delete-document').click();
    await page.getByTestId('confirm-accept').click();
    await expect(page.getByTestId('document-row')).toHaveCount(0);
  });

  test('stores English name, Lao address, contract/pay type and manager; history shows the transfer with its effective date', async ({ page }, info) => {
    const code = `M${info.project.name.slice(0, 1).toUpperCase()}${Date.now() % 100000}`;
    await createEmployee(page, code, async (p) => {
      await p.locator('#firstNameEn').fill('Test');
      await p.locator('#lastNameEn').fill(code);
      await p.locator('#village').fill('ໂພນທັນ');
      await p.locator('#district').fill('ໄຊເສດຖາ');
      await p.locator('#province').selectOption('LP');
      await p.locator('#contractType').selectOption('FIXED_TERM');
      await p.locator('#contractEndDate').fill('2027-01-04');
      await p.locator('#payType').selectOption('DAILY');
    });
    await expect(page.getByTestId('name-en')).toHaveText(`Test ${code}`);
    await expect(page.getByText('ຫຼວງພະບາງ')).toBeVisible();
    await expect(page.getByTestId('contract-type')).toHaveText('ມີກຳນົດເວລາ');
    await expect(page.getByTestId('pay-type')).toHaveText('ລາຍວັນ');

    await page.getByRole('link', { name: /ແກ້ໄຂ|Edit/ }).click();
    // Seeded E001 (ສົມສັກ ພົມມະວົງ) becomes the manager, effective on a date HR picks.
    await page.locator('#managerId').selectOption({ label: 'E001 · ສົມສັກ ພົມມະວົງ' });
    await page.locator('#effectiveDate').fill('2026-03-01');
    await page.getByTestId('employee-submit').click();
    await expect(page).toHaveURL(/\/employees\/[^/]+$/);
    const latest = page.getByTestId('history-card').getByTestId('history-row').first();
    await expect(latest).toContainText('2026-03-01');
    await expect(latest).toContainText('ສົມສັກ ພົມມະວົງ');
  });

  test('rejects a contract end date before the hire date', async ({ page }, info) => {
    await page.goto('/employees/new');
    await page.locator('#employeeCode').fill(`X${info.project.name.slice(0, 1).toUpperCase()}${Date.now() % 100000}`);
    await page.locator('#firstName').fill('ທົດສອບ');
    await page.locator('#lastName').fill('ວັນທີ');
    await page.locator('#hireDate').fill('2026-01-05');
    await page.locator('#contractType').selectOption('FIXED_TERM');
    await page.locator('#contractEndDate').fill('2025-12-31');
    await page.getByTestId('employee-submit').click();
    await expect(page.getByText('ວັນທີນີ້ຕ້ອງບໍ່ກ່ອນວັນເຂົ້າວຽກ')).toBeVisible();
  });
});
