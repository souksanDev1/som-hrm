import { expect, test, type TestInfo } from '@playwright/test';
import { loginAsAdmin } from './fixtures';

const HEADER = 'employeeCode,firstName,lastName,gender,hireDate,contractType,payType';

/** Codes unique per project (desktop/tablet/mobile) and per run, so reruns never collide. */
const codePrefix = (info: TestInfo) => `IM${info.project.name.slice(0, 1).toUpperCase()}${Date.now().toString(36).slice(-5).toUpperCase()}`;
const csvFile = (lines: string[]) => ({ name: 'staff.csv', mimeType: 'text/csv', buffer: Buffer.from([HEADER, ...lines].join('\n')) });

/** Bulk employee import (FR-EMP-09): preview shows errors and saves nothing; confirm creates every row. */
test.describe('employee import', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('downloads the template, previews a valid file and imports it', async ({ page }, info) => {
    const prefix = codePrefix(info);
    await page.goto('/employees');
    await page.getByTestId('import-employees').click();
    await expect(page).toHaveURL(/\/employees\/import$/);

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('import-template-csv').click()]);
    expect(download.suggestedFilename()).toBe('employee-import-template.csv');

    await page.getByTestId('import-file').setInputFiles(
      csvFile([`${prefix}-1,ສົມໃຈ,ນຳເຂົ້າ,FEMALE,2024-01-15,INDEFINITE,MONTHLY`, `${prefix}-2,ສົມພອນ,ນຳເຂົ້າ,MALE,2024-02-01,FIXED_TERM,DAILY`]),
    );
    await expect(page.getByTestId('import-summary')).toBeVisible();
    await expect(page.getByTestId('import-sample-row')).toHaveCount(2);
    await expect(page.getByTestId('import-errors')).toHaveCount(0);

    await page.getByTestId('import-confirm').click();
    await page.getByTestId('confirm-accept').click();
    await expect(page.getByTestId('import-done')).toBeVisible();

    await page.goto('/employees');
    await page.getByTestId('employee-search').fill(prefix);
    await expect(page.locator('[data-testid="employee-row"]:visible, [data-testid="employee-card"]:visible')).toHaveCount(2);
  });

  test('lists error rows and offers no confirm', async ({ page }, info) => {
    const prefix = codePrefix(info);
    await page.goto('/employees/import');
    await page.getByTestId('import-file').setInputFiles(
      csvFile([
        `${prefix}-1,ສົມ,ດີ,MALE,2024-01-15,INDEFINITE,MONTHLY`,
        `${prefix}-1,ສົມ,ດີ,ROBOT,2024-13-01,INDEFINITE,MONTHLY`,
      ]),
    );
    const errors = page.getByTestId('import-error');
    await expect(errors).toHaveCount(3);
    await expect(page.locator('[data-testid="import-sample-row"][data-invalid="true"]')).toHaveCount(1);
    await expect(page.getByTestId('import-confirm')).toHaveCount(0);

    await page.goto('/employees');
    await page.getByTestId('employee-search').fill(prefix);
    await expect(page.locator('[data-testid="employee-row"]:visible, [data-testid="employee-card"]:visible')).toHaveCount(0);
  });
});
