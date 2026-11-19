import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, loginAsAdmin } from './fixtures';

/** Unique per project so desktop/tablet/mobile runs against the same seeded DB do not collide. */
const projectIndex = (name: string) => ({ desktop: 1, tablet: 2, mobile: 3 })[name] ?? 4;

const createEmployee = async (page: Page, code: string) => {
  await page.goto('/employees/new');
  await page.locator('#employeeCode').fill(code);
  await page.locator('#firstName').fill('ທົດສອບ');
  await page.locator('#lastName').fill(code);
  await page.locator('#hireDate').fill('2026-01-05');
  await page.locator('#departmentId').selectOption({ label: 'ປະຕິບັດການ' });
  await page.locator('#managerId').selectOption({ label: 'E002 · ບົວພັນ ສີສຸວັນ' });
  await page.getByTestId('employee-submit').click();
  // `/employees/new` also matches a bare id pattern; wait for the created employee's page.
  await expect(page).toHaveURL(/\/employees\/(?!new$)[^/]+$/);
  return page.url();
};

test.describe('working schedules (FR-WS-03)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('schedules a future standard and rejects more than 48 h a week', async ({ page }, info) => {
    const date = `2098-0${projectIndex(info.project.name)}-01`;
    await page.goto('/settings/work-schedule');
    const card = page.getByTestId('standard-schedule');
    await expect(card.getByTestId('standard-current')).toBeVisible();
    await expectNoHorizontalScroll(page);

    await card.getByRole('button', { name: /ກຳນົດມາດຕະຖານໃໝ່|Schedule a new standard/ }).click();
    const form = page.getByTestId('standard-form');
    // Sunday 8 h on top of Mon–Sat 8 h = 56 h → blocked with the legal-limit message.
    await form.locator('#standard-day-0').fill('8');
    await form.locator('#standard-reason').fill('E2E');
    await form.getByRole('button', { name: /ບັນທຶກ|Save/ }).click();
    await expect(form.getByTestId('standard-pattern-error')).toContainText(/48/);

    await form.getByRole('button', { name: /5 ມື້|5 days/ }).click();
    await form.locator('#standard-effectiveFrom').fill(date);
    await form.getByRole('button', { name: /ບັນທຶກ|Save/ }).click();
    await expect(form).toBeHidden();
    await expect(card.getByTestId('standard-scheduled')).toContainText(date);
  });

  test('applies an individual schedule, shows it on the profile, then reverts it', async ({ page }, info) => {
    const code = `WS${info.project.name.slice(0, 1).toUpperCase()}${Date.now() % 100000}`;
    const profileUrl = await createEmployee(page, code);
    await expect(page.getByTestId('work-schedule-card').getByTestId('schedule-source')).toHaveText(/ມາດຕະຖານ|Standard/);

    await page.goto('/settings/work-schedule');
    const manager = page.getByTestId('override-manager');
    await manager.getByRole('button', { name: /ກຳນົດຕາຕະລາງສະເພາະ|Set individual schedule/ }).click();
    const form = page.getByTestId('override-form');
    await form.getByTestId('employee-picker').getByRole('searchbox').fill(code);
    await form.getByLabel(new RegExp(`^${code} ·`)).check();
    await expect(form.getByTestId('picked-count')).toContainText('1');
    await form.getByRole('button', { name: /ເສົາເຄິ່ງມື້|half Saturday/ }).click();
    await form.locator('#override-label').fill('E2E half Saturday');
    await form.locator('#override-reason').fill('E2E');
    await form.getByRole('button', { name: /ບັນທຶກ|Save/ }).click();
    await expect(form).toBeHidden();

    const row = manager.getByTestId(`override-row-${code}`);
    await expect(row).toContainText(/ສະເພາະບຸກຄົນ|Individual/);
    await expect(row).toContainText('E2E half Saturday');
    await expectNoHorizontalScroll(page);

    await page.goto(profileUrl);
    const scheduleCard = page.getByTestId('work-schedule-card');
    await expect(scheduleCard.getByTestId('schedule-source')).toHaveText(/ສະເພາະບຸກຄົນ|Individual/);
    await expect(scheduleCard.getByTestId('schedule-summary')).toContainText('44');

    await page.goto('/settings/work-schedule');
    await manager.getByTestId(`override-row-${code}`).getByRole('button', { name: /ກັບໄປໃຊ້ມາດຕະຖານ|Revert to standard/ }).click();
    const revert = page.getByTestId('revert-form');
    await revert.locator('#revert-reason').fill('E2E');
    await revert.getByRole('button', { name: /ກັບໄປໃຊ້ມາດຕະຖານ|Revert to standard/ }).click();
    await expect(revert).toBeHidden();
    // Reverted from today: no override and nothing scheduled, so the employee leaves the list.
    await expect(manager.getByTestId(`override-row-${code}`)).toHaveCount(0);

    await page.goto(profileUrl);
    await expect(page.getByTestId('work-schedule-card').getByTestId('schedule-source')).toHaveText(/ມາດຕະຖານ|Standard/);
  });

  test('lists the seeded supervisor with an individual schedule', async ({ page }) => {
    await page.goto('/settings/work-schedule');
    await expect(page.getByTestId('override-row-E002')).toContainText(/ສະເພາະບຸກຄົນ|Individual/);
  });
});
