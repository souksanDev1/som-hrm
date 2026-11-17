import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, loginAsAdmin } from './fixtures';

/** A far-future year per project, so parallel desktop/tablet/mobile runs never share dates. */
const YEAR_BY_PROJECT: Record<string, number> = { desktop: 2091, tablet: 2092, mobile: 2093 };

test.describe('holiday calendar', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('is reachable from settings and shows this year with 8 March women-only', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: 'ປະຕິທິນວັນພັກ' }).click();
    await expect(page).toHaveURL(/\/settings\/holidays$/);
    const list = page.getByTestId('holiday-list');
    await expect(list.getByTestId('holiday-row').filter({ hasText: '-03-08' })).toContainText('ສະເພາະພະນັກງານຍິງ');
    await expectNoHorizontalScroll(page);
  });

  test('adds defaults for a new year, then a festival and a national day', async ({ page }, info) => {
    const year = YEAR_BY_PROJECT[info.project.name] ?? 2094;
    await page.goto('/settings/holidays');
    const current = Number((await page.getByTestId('holiday-year').innerText()).replace(/\D/g, ''));
    for (let y = current; y < year; y++) await page.getByRole('button', { name: 'ຖັດໄປ' }).click();
    await expect(page.getByTestId('holiday-year')).toContainText(String(year));

    await page.getByTestId('holiday-ensure').click();
    await expect(page.getByTestId('holiday-notice')).toBeVisible();
    await expect(page.getByTestId('holiday-row')).toHaveCount(7);
    // Idempotent: a second click adds nothing.
    await page.getByTestId('holiday-ensure').click();
    await expect(page.getByTestId('holiday-notice')).toContainText('0');
    await expect(page.getByTestId('holiday-row')).toHaveCount(7);

    await page.getByTestId('holiday-add').click();
    await page.locator('#holiday-form-date').fill(`${year}-10-21`);
    await page.locator('#holiday-form-nameLo').fill('ບຸນອອກພັນສາ');
    await page.locator('#holiday-form-nameEn').fill('Boun Ok Phansa');
    await page.locator('#holiday-form-kind').selectOption('TRADITIONAL');
    await page.getByTestId('holiday-form-save').click();
    await expect(page.getByTestId('holiday-row').filter({ hasText: 'ບຸນອອກພັນສາ' })).toContainText('ບຸນປະເພນີ');

    await page.getByTestId('holiday-add').click();
    await page.locator('#holiday-form-date').fill(`${year}-09-02`);
    await page.locator('#holiday-form-nameLo').fill('ວັນຊາດຫວຽດນາມ');
    await page.locator('#holiday-form-nameEn').fill('Vietnam National Day');
    await page.locator('#holiday-form-kind').selectOption('NATIONAL_DAY');
    await page.getByTestId('holiday-form-save').click();
    await expect(page.locator('#holiday-form-nationality')).toHaveAttribute('aria-invalid', 'true');
    await page.locator('#holiday-form-nationality').fill('Vietnamese');
    await page.getByTestId('holiday-form-save').click();
    await expect(page.getByTestId('holiday-row').filter({ hasText: 'ວັນຊາດຫວຽດນາມ' })).toContainText('Vietnamese');

    // Clean up so reruns start from the same state.
    for (const name of ['ບຸນອອກພັນສາ', 'ວັນຊາດຫວຽດນາມ']) {
      await page.getByRole('button', { name: `ລຶບ ${name}` }).click();
      await page.getByTestId('confirm-accept').click();
      await expect(page.getByTestId('holiday-row').filter({ hasText: name })).toHaveCount(0);
    }
  });
});
