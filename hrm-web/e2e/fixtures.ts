import { expect, type Page } from '@playwright/test';

/** Demo accounts created by hrm-api/prisma/seed.ts (development data only). */
export const DEMO = {
  workspaceCode: 'som-demo',
  admin: { identifier: 'admin@som.la', password: 'Admin1234' },
  fieldWorker: { identifier: 'E003', phone: '020 5555 0003', pin: '482913' },
} as const;

export const loginWithPassword = async (page: Page, identifier: string = DEMO.admin.identifier, password: string = DEMO.admin.password) => {
  await page.goto('/login');
  await page.locator('#workspaceCode').fill(DEMO.workspaceCode);
  await page.locator('#identifier').fill(identifier);
  await page.locator('#password').fill(password);
  await page.getByTestId('login-form').getByRole('button', { name: /ເຂົ້າສູ່ລະບົບ|Sign in/ }).click();
};

export const loginAsAdmin = async (page: Page) => {
  await loginWithPassword(page);
  await expect(page).toHaveURL(/\/dashboard/);
};

export const loginWithPin = async (page: Page, identifier: string, pin: string) => {
  await page.goto('/login');
  await page.getByRole('tab', { name: /PIN/ }).click();
  await page.locator('#workspaceCode').fill(DEMO.workspaceCode);
  await page.locator('#identifier').fill(identifier);
  await page.locator('#pin').fill(pin);
  await page.getByTestId('login-form').getByRole('button', { name: /ເຂົ້າສູ່ລະບົບ|Sign in/ }).click();
};

/** Fails when the page scrolls horizontally (broken responsive layout). */
export const expectNoHorizontalScroll = async (page: Page) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
};
