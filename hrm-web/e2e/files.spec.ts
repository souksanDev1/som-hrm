import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './fixtures';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');

/** Employee document upload/download (FR-EMP-07) on the seeded foreign worker's work permit. */
test.describe('document files', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('uploads a PDF to a document, then downloads it', async ({ page }, info) => {
    await page.goto('/employees');
    await page.getByTestId('employee-search').fill('Nguyen');
    const row = page.locator('[data-testid="employee-row"]:visible, [data-testid="employee-card"]:visible');
    await expect(row).toHaveCount(1);
    await row.first().getByRole('link').first().click();
    await expect(page).toHaveURL(/\/employees\/(?!new$)[^/]+$/);

    const doc = page.getByTestId('document-row').first();
    const fileName = `permit-${info.project.name}.pdf`;
    await doc.getByTestId('document-upload').setInputFiles({ name: fileName, mimeType: 'application/pdf', buffer: PDF });
    const downloadButton = doc.getByTestId('document-download');
    await expect(downloadButton).toContainText(fileName);

    const [download] = await Promise.all([page.waitForEvent('download'), downloadButton.click()]);
    expect(download.suggestedFilename()).toBe(fileName);
  });

  test('rejects a file that is not PDF/JPG/PNG', async ({ page }) => {
    await page.goto('/employees');
    await page.getByTestId('employee-search').fill('Nguyen');
    const row = page.locator('[data-testid="employee-row"]:visible, [data-testid="employee-card"]:visible');
    await expect(row).toHaveCount(1);
    await row.first().getByRole('link').first().click();

    const doc = page.getByTestId('document-row').nth(1);
    await doc.getByTestId('document-upload').setInputFiles({ name: 'fake.pdf', mimeType: 'application/pdf', buffer: Buffer.from('<html></html>') });
    await expect(doc.getByRole('alert')).toBeVisible();
  });
});
