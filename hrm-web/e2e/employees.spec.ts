import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, loginAsAdmin } from './fixtures';

const rowsOrCards = (page: Page) => page.locator('[data-testid="employee-row"]:visible, [data-testid="employee-card"]:visible');

/** Search, wait until exactly one result is shown (search is debounced), then open it. */
const openEmployee = async (page: Page, query: string) => {
  await page.goto('/employees');
  await page.getByTestId('employee-search').fill(query);
  await expect(rowsOrCards(page)).toHaveCount(1);
  await rowsOrCards(page).first().getByRole('link').first().click();
  await expect(page).toHaveURL(/\/employees\/[^/]+$/);
};

test.describe('employees', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('lists and searches seeded employees', async ({ page }) => {
    await page.goto('/employees');
    // Seeded staff E001–E004 are always present (other tests may add more).
    for (const code of ['E001', 'E002', 'E003', 'E004']) await expect(page.getByText(code, { exact: true }).first()).toBeAttached();
    await page.getByTestId('employee-search').fill('Nguyen');
    await expect(rowsOrCards(page)).toHaveCount(1);
    await expectNoHorizontalScroll(page);
  });

  test('foreign worker documents show expiry alerts', async ({ page }) => {
    await openEmployee(page, 'Nguyen');
    await expect(page.locator('[data-expiry="D30"]')).toBeVisible();
    await expect(page.locator('[data-expiry="D60"]')).toBeVisible();
    await expect(page.locator('[data-expiry="VALID"]')).toBeVisible();
  });

  test('HR sees decrypted social-security number', async ({ page }) => {
    await openEmployee(page, 'E003');
    await expect(page.getByTestId('ssn')).toHaveText('SS1000003');
  });

  test('creates an employee with a PIN login and shows the one-time PIN', async ({ page }, info) => {
    const code = `N${info.project.name.slice(0, 1).toUpperCase()}${Date.now() % 100000}`;
    await page.goto('/employees/new');
    await page.locator('#employeeCode').fill(code);
    await page.locator('#firstName').fill('ແສງ');
    await page.locator('#lastName').fill('ຈັນທະລາ');
    await page.locator('#phone').fill(`020 77${String(Date.now()).slice(-6)}`);
    await page.locator('#hireDate').fill('2026-01-05');
    await page.locator('#socialSecurityNo').fill('SS7777777');
    await page.locator('#createLogin').check();
    await page.getByTestId('employee-submit').click();
    await expect(page.getByTestId('temporary-secret')).toHaveText(/^\d{6}$/);
    await page.getByRole('button', { name: 'OK' }).click();
    await expect(page.getByRole('heading', { name: 'ແສງ ຈັນທະລາ' })).toBeVisible();
  });

  test('shows validation errors for invalid phone and missing country', async ({ page }) => {
    await page.goto('/employees/new');
    await page.locator('#employeeCode').fill('BAD1');
    await page.locator('#firstName').fill('A');
    await page.locator('#lastName').fill('B');
    await page.locator('#hireDate').fill('2026-01-05');
    await page.locator('#phone').fill('12345');
    await page.locator('#nationalityType').selectOption('FOREIGN');
    await page.getByTestId('employee-submit').click();
    await expect(page.getByText('ເບີໂທບໍ່ຖືກຕ້ອງ (020 XXXX XXXX)')).toBeVisible();
    await expect(page.getByText('ກະລຸນາລະບຸປະເທດ')).toBeVisible();
  });

  test('adds a work-permit document', async ({ page }) => {
    await openEmployee(page, 'E002');
    await expect(page.getByTestId('add-document')).toBeVisible();
    const before = await page.getByTestId('document-row').count();
    await page.getByTestId('add-document').click();
    await page.locator('#doc-number').fill('WP-E2E');
    await page.locator('#doc-expires').fill('2030-01-01');
    await page.getByTestId('save-document').click();
    await expect(page.getByTestId('document-row')).toHaveCount(before + 1);
  });
});
