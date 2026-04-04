import { test, expect } from '@playwright/test';

/**
 * E2E tests for the Admin Dashboard (AdminHome).
 * These tests run against the dev server with no real backend,
 * so they validate UI structure, routing, and unauthenticated redirects.
 */

test.describe('Admin Dashboard — unauthenticated guard', () => {
  test('redirects unauthenticated user from /admin/home to login', async ({ page }) => {
    await page.goto('/admin/home');
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('redirects unauthenticated user from /grievances/verify to login', async ({ page }) => {
    await page.goto('/grievances/verify');
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('redirects unauthenticated user from /admin/action-center to login', async ({ page }) => {
    await page.goto('/admin/action-center');
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});

test.describe('Login page structure', () => {
  test('shows all required form fields', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByLabel(/Email \/ Employee ID/i)).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Login/i })).toBeVisible();
  });

  test('shows validation errors on empty submit', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByRole('button', { name: /Login/i }).click();
    await expect(page.getByText('Email or Employee ID is required')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
  });

  test('does not navigate away on failed login (no backend)', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByLabel(/Email \/ Employee ID/i).fill('admin@test.com');
    await page.getByLabel('Password', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: /Login/i }).click();
    // Should stay on login page or show error — not navigate to dashboard
    await page.waitForTimeout(3000);
    await expect(page).not.toHaveURL('/admin/home');
  });
});

test.describe('Staff portal — unauthenticated guard', () => {
  test('redirects unauthenticated user from /staff/home to login', async ({ page }) => {
    await page.goto('/staff/home');
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('redirects unauthenticated user from /staff/print-center to login', async ({ page }) => {
    await page.goto('/staff/print-center');
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});

test.describe('Page load — public pages', () => {
  test('root redirects to login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('login page loads without JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/auth/login');
    await expect(page.getByRole('button', { name: /Login/i })).toBeVisible();
    expect(errors).toHaveLength(0);
  });
});
