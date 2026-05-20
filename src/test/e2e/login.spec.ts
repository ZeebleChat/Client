import { test, expect } from '@playwright/test';

test.describe('Login page', () => {
  test('renders login form', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
    await expect(page.getByLabel(/beam identity/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test('shows error on empty submit', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/required|enter/i)).toBeVisible();
  });

  test('shows error on bad credentials', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/beam identity/i).fill('nobody»0000');
    await page.getByLabel(/password/i).fill('wrongpassword');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/invalid|failed|incorrect/i)).toBeVisible({ timeout: 8_000 });
  });
});
