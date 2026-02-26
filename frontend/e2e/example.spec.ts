import { test, expect } from '@playwright/test';

test('homepage loads correctly', async ({ page }) => {
    await page.goto('/');
    // Checking that the page has loaded by seeing if it has a title
    // or waiting for some network call to complete.
    // Because it's an abstract starter test, we'll just check if body exists
    const body = page.locator('body');
    await expect(body).toBeVisible();
});
