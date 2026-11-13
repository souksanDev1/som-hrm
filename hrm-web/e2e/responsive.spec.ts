import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, loginAsAdmin } from './fixtures';

test('navigation adapts to the viewport', async ({ page }) => {
  await loginAsAdmin(page);
  const width = page.viewportSize()!.width;
  const tabBar = page.getByRole('navigation', { name: 'mobile' });
  const sidebar = page.getByRole('navigation', { name: 'main' });
  if (width < 1024) {
    await expect(tabBar).toBeVisible();
    await expect(sidebar).toBeHidden();
    await tabBar.getByRole('link', { name: 'ພະນັກງານ' }).click();
  } else {
    await expect(sidebar).toBeVisible();
    await expect(tabBar).toBeHidden();
    await sidebar.getByRole('link', { name: 'ພະນັກງານ' }).click();
  }
  await expect(page).toHaveURL(/\/employees/);
  await expectNoHorizontalScroll(page);
});
