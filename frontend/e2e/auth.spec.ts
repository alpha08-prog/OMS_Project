import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
    test('User can successfully load login page', async ({ page }) => {
        // Navigate to the root URL, which should redirect to /auth/login
        await page.goto('/');

        // Check if the URL successfully redirected to the login page
        await expect(page).toHaveURL(/.*\/auth\/login/);

        // Verify main components of the login page
        await expect(page.getByRole('heading', { name: /Login/i })).toBeVisible();
        await expect(page.getByLabel(/Email \/ Employee ID/i)).toBeVisible();
        await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: /Login/i })).toBeVisible();
    });

    test('Displays error on submitting empty form', async ({ page }) => {
        await page.goto('/auth/login');

        const loginButton = page.getByRole('button', { name: /Login/i });
        await loginButton.click();

        // Verify validation messages appear
        await expect(page.getByText('Email or Employee ID is required')).toBeVisible();
        await expect(page.getByText('Password is required')).toBeVisible();
    });

    test('Submits form and shows network error when backend is offline', async ({ page }) => {
        // This is useful to test the UI's error handling since we aren't spinning up the real DB
        await page.goto('/auth/login');

        await page.getByLabel(/Email \/ Employee ID/i).fill('test@admin.gov.in');
        await page.getByLabel('Password', { exact: true }).fill('password123');

        const loginButton = page.getByRole('button', { name: /Login/i });
        await loginButton.click();

        // We expect a connection error to be displayed by the UI since no real backend API is running on 5000 in this E2E test env
        await expect(page.locator('#form-error')).toBeVisible({ timeout: 10000 });
    });
});
