import { expect, test, type TestInfo } from '@playwright/test';
import { loginAsAdmin } from './fixtures';

/**
 * Scanner-file import (FR-ATT-02). Seed: E003 works at the Pakse site (SCANNER enabled), E001 at head office
 * (MOBILE only). Each project uses its own past date and each run its own minute, so reruns never collide with the
 * punches stored by earlier runs (same employee + same minute = DUPLICATE).
 */
const PROJECT_DATE: Record<string, string> = { desktop: '2026-01-05', tablet: '2026-01-06', mobile: '2026-01-07' };

const runStamp = (info: TestInfo) => {
  const minuteOfDay = Math.floor(Date.now() / 60_000) % 600; // 00:00–09:59, varies per run
  const time = `${String(Math.floor(minuteOfDay / 60) + 10).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`;
  return { date: PROJECT_DATE[info.project.name] ?? '2026-01-08', time, tag: `${info.project.name}-${Date.now().toString(36)}` };
};

const genericFile = (name: string, lines: string[]) => ({
  name,
  mimeType: 'text/csv',
  buffer: Buffer.from(['employee_code,date,time,type', ...lines].join('\n')),
});

test.describe('scanner file import', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('previews statuses with filters, imports the OK rows and lists the import in the history', async ({ page }, info) => {
    const { date, time, tag } = runStamp(info);
    const fileName = `scans-${tag}.csv`;
    await page.goto('/attendance/scan-import');
    await page.getByTestId('scan-format').selectOption('GENERIC');

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('scan-template-csv').click()]);
    expect(download.suggestedFilename()).toBe('scan-import-template.csv');

    const file = genericFile(fileName, [`E003,${date},${time}:05`, `E003,${date},${time}:40`, `NOPE-${tag},${date},${time}`, `E001,${date},${time}`]);
    await page.getByTestId('scan-file').setInputFiles(file);
    await expect(page.getByTestId('scan-preview')).toBeVisible();
    await expect(page.getByTestId('scan-count-ALL')).toHaveText('4');
    await expect(page.getByTestId('scan-count-OK')).toHaveText('1');
    await expect(page.getByTestId('scan-count-DUPLICATE')).toHaveText('1');
    await expect(page.getByTestId('scan-count-UNMATCHED')).toHaveText('1');
    await expect(page.getByTestId('scan-count-INVALID')).toHaveText('1');

    await page.getByTestId('scan-filter-UNMATCHED').click();
    await expect(page.getByTestId('scan-row')).toHaveCount(1);
    await expect(page.getByTestId('scan-row')).toContainText(`NOPE-${tag}`);
    await page.getByTestId('scan-filter-ALL').click();
    await expect(page.getByTestId('scan-row')).toHaveCount(4);

    await page.getByTestId('scan-confirm').click();
    await page.getByTestId('confirm-accept').click();
    await expect(page.getByTestId('scan-import-done')).toBeVisible();
    await expect(page.getByTestId('scan-history-row').filter({ hasText: fileName })).toHaveCount(1);

    // The same file again: the stored scan is now a duplicate, so nothing can be imported.
    await page.getByTestId('scan-import-another').click();
    await page.getByTestId('scan-format').selectOption('GENERIC');
    await page.getByTestId('scan-file').setInputFiles(file);
    await expect(page.getByTestId('scan-count-DUPLICATE')).toHaveText('2');
    await expect(page.getByTestId('scan-count-OK')).toHaveText('0');
    await expect(page.getByTestId('scan-confirm')).toHaveCount(0);
  });

  test('rejects a file without the required columns', async ({ page }) => {
    await page.goto('/attendance/scan-import');
    await page.getByTestId('scan-format').selectOption('GENERIC');
    await page.getByTestId('scan-file').setInputFiles({ name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('name,when\nx,y\n') });
    await expect(page.getByRole('alert').filter({ hasText: /ຂາດຖັນ|lacks/ })).toBeVisible();
    await expect(page.getByTestId('scan-preview')).toHaveCount(0);
  });
});
