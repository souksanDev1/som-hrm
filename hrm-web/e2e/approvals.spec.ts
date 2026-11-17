import { expect, test, type Page } from '@playwright/test';
import { DEMO, expectNoHorizontalScroll, loginWithPassword } from './fixtures';

/** Unique per project so desktop/tablet/mobile runs against the same seeded DB do not collide. */
const projectIndex = (name: string) => ({ desktop: 1, tablet: 2, mobile: 3 })[name] ?? 4;

const loginAsManager = async (page: Page) => {
  await loginWithPassword(page, DEMO.manager.identifier, DEMO.manager.password);
  await expect(page).toHaveURL(/\/dashboard/);
};

/** Open the seeded request of E003 whose reason is `reason` from the inbox. */
const openRequest = async (page: Page, reason: string) => {
  await page.goto('/approvals');
  const row = page.getByTestId('approval-row').filter({ hasText: reason });
  await expect(row).toHaveCount(1);
  await row.getByRole('link').click();
  // `/approvals` itself also matches a loose pattern; wait for a request id.
  await expect(page).toHaveURL(/\/approvals\/[^/]+$/);
  await expect(page.getByTestId('approval-detail')).toContainText(reason);
};

test.describe('approval inbox (FR-ORG-02, FR-ORG-06)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsManager(page);
  });

  test('approves a leave request as the direct manager', async ({ page }, info) => {
    const reason = DEMO.leaveReasons[projectIndex(info.project.name) * 2 - 1]!;
    await openRequest(page, reason);
    await expectNoHorizontalScroll(page);
    await expect(page.getByTestId('approval-my-capacity')).toContainText(/ຫົວໜ້າ|Manager/);
    await page.locator('#approval-note').fill('Enjoy');
    await page.getByTestId('approval-approve').click();
    await expect(page.getByTestId('approval-status')).toHaveText(/ອະນຸມັດແລ້ວ|Approved/);
    await expect(page.getByTestId('decision-form')).toBeHidden();
    await expect(page.getByTestId('approval-step').first()).toContainText('Enjoy');

    await page.goto('/approvals');
    await expect(page.getByTestId('approval-row').filter({ hasText: reason })).toHaveCount(0);
  });

  test('rejects a leave request only with a reason', async ({ page }, info) => {
    const reason = DEMO.leaveReasons[projectIndex(info.project.name) * 2]!;
    await openRequest(page, reason);
    await page.getByTestId('approval-reject').click();
    await expect(page.getByTestId('decision-form').getByText(/ເຫດຜົນທີ່ປະຕິເສດ|Reason for rejecting/)).toBeVisible();
    await expect(page.getByTestId('approval-status')).toHaveText(/ລໍຖ້າອະນຸມັດ|Pending/);
    await page.locator('#approval-note').fill('Busy week');
    await page.getByTestId('approval-reject').click();
    await expect(page.getByTestId('approval-status')).toHaveText(/ຖືກປະຕິເສດ|Rejected/);
    await expect(page.getByTestId('approval-step').first()).toContainText('Busy week');
  });
});

test.describe('approval delegates (FR-ORG-03.1)', () => {
  test('adds, edits and cancels a delegate on the account page', async ({ page }, info) => {
    const n = projectIndex(info.project.name);
    const start = `2097-0${n}-01`;
    const end = `2097-0${n}-10`;
    const newEnd = `2097-0${n}-12`;
    // Rows of earlier runs stay listed as cancelled; the tag tells this run's row apart.
    const tag = `E2E ${info.project.name} ${Date.now()}`;
    await loginAsManager(page);
    await page.goto('/account');
    const card = page.getByTestId('delegations-card');
    await expect(card).toBeVisible();
    await expectNoHorizontalScroll(page);

    await card.getByTestId('delegation-add').click();
    const form = page.getByTestId('delegation-form');
    await form.locator('#delegation-delegate').selectOption({ index: 1 });
    await form.locator('#delegation-start').fill(start);
    await form.locator('#delegation-end').fill(end);
    await form.locator('#delegation-reason').fill(tag);
    await form.getByTestId('delegation-save').click();
    await expect(form).toBeHidden();

    const row = card.getByTestId('delegation-row').filter({ hasText: tag });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(`${start} – ${end}`);
    await expect(row).toContainText(/ລໍຖ້າມີຜົນ|Scheduled/);

    // Overlapping period for the same manager is refused by the API.
    await card.getByTestId('delegation-add').click();
    await form.locator('#delegation-delegate').selectOption({ index: 1 });
    await form.locator('#delegation-start').fill(`2097-0${n}-05`);
    await form.locator('#delegation-end').fill(`2097-0${n}-06`);
    await form.getByTestId('delegation-save').click();
    await expect(form.getByTestId('delegation-error')).toBeVisible();
    await form.getByRole('button', { name: /ຍົກເລີກ|Cancel/ }).first().click();
    await expect(form).toBeHidden();

    await row.getByTestId('delegation-edit').click();
    await form.locator('#delegation-end').fill(newEnd);
    await form.getByTestId('delegation-save').click();
    await expect(form).toBeHidden();
    await expect(row).toContainText(`${start} – ${newEnd}`);

    await row.getByTestId('delegation-cancel').click();
    await page.getByTestId('confirm-accept').click();
    await expect(row).toContainText(/ຍົກເລີກແລ້ວ|Cancelled/);
    await expect(row.getByTestId('delegation-cancel')).toHaveCount(0);
  });
});
