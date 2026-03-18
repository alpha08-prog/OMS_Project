import { test, expect } from '@playwright/test';

test.describe('Additional Staff Form Tests', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to root to initialize storage
        await page.goto('/');

        // Inject mock session data to bypass login screen as STAFF
        await page.evaluate(() => {
            sessionStorage.setItem('auth_token', 'mock_token');
            sessionStorage.setItem('auth_session', '1');
            localStorage.setItem('user_role', 'STAFF');
            sessionStorage.setItem('user_role', 'STAFF');
            sessionStorage.setItem('user_name', 'Test Staff Member');
        });
    });

    test.describe('Train EQ Create Form', () => {
        test.beforeEach(async ({ page }) => {
            await page.goto('/train-eq/new');
        });

        test('should display required field validation errors', async ({ page }) => {
            const submitBtn = page.getByRole('button', { name: /Generate EQ Letter/i });

            // Submit empty form (passenger 1 is initially empty, but it triggers PNR validation if passengers exist)
            // Actually if passenger is empty, it fails passenger validation
            await submitBtn.click();
            await expect(page.getByText('At least one passenger name is required')).toBeVisible();

            // Fill passenger name
            await page.getByPlaceholder('Enter passenger 1 full name').fill('John Doe');
            await submitBtn.click();

            // Next validation
            await expect(page.getByText('PNR number is required')).toBeVisible();
        });

        test('should validate passenger limit based on booking type', async ({ page }) => {
            // General allows 6, Tatkal allows 4.
            // Switch to Tatkal
            await page.getByText('Tatkal Booking').click();

            // Click Add Passenger 4 times (1 is already there, so we will have 5, but limit is 4)
            await page.getByRole('button', { name: /Add Passenger/i }).click();
            await page.getByRole('button', { name: /Add Passenger/i }).click();
            await page.getByRole('button', { name: /Add Passenger/i }).click();

            // The 4th click should be disabled or not add if it hit the limit
            await expect(page.getByRole('button', { name: /Add Passenger/i })).toBeDisabled();

            const passengerInputs = page.locator('input[placeholder^="Enter passenger"]');
            await expect(passengerInputs).toHaveCount(4);
        });
    });

    test.describe('Tour Program Create Form', () => {
        test.beforeEach(async ({ page }) => {
            await page.goto('/tour-program/new');
        });

        test('should enforce mandatory fields', async ({ page }) => {
            await page.getByRole('button', { name: /Save Tour Program/i }).click();
            await expect(page.getByText('Event name is required')).toBeVisible();

            await page.getByPlaceholder('Enter event name').fill('Annual Party Meet');
            await page.getByRole('button', { name: /Save Tour Program/i }).click();
            await expect(page.getByText('Organizer is required')).toBeVisible();
        });

        test('should successfully accept valid inputs', async ({ page }) => {
            await page.getByPlaceholder('Enter event name').fill('School Inauguration');
            await page.getByPlaceholder('Enter organizer name').fill('Local Education Board');
            await page.getByPlaceholder('Eg: School Principal, NGO Head').fill('Principal Sharma');

            // Using generic locator for datetime-local
            await page.locator('input[type="datetime-local"]').fill('2026-03-10T10:00');
            await page.getByPlaceholder('Venue or Google Maps link').fill('City High School');

            await expect(page.getByPlaceholder('Enter event name')).toHaveValue('School Inauguration');
        });
    });

    test.describe('News Intelligence Create Form', () => {
        test.beforeEach(async ({ page }) => {
            await page.goto('/news-intelligence/new');
        });

        test('should validate region and category dropsdowns', async ({ page }) => {
            await page.getByPlaceholder('Short summary of the news or intelligence').fill('Breaking: New bridge approved');

            await page.getByRole('button', { name: /Save Intelligence/i }).click();
            // Fails on category
            await expect(page.getByText('Please select a category')).toBeVisible();

            // Select Category
            await page.getByRole('combobox').first().click();
            await page.getByRole('option', { name: 'Development Work' }).click();

            await page.getByRole('button', { name: /Save Intelligence/i }).click();
            // Fails on Region
            await expect(page.getByText('Please select a region')).toBeVisible();
        });

        test('should respect priority selection', async ({ page }) => {
            // Click radio button for Critical
            await page.locator('label[for="critical"]').click();

            // Ensure it is checked
            await expect(page.locator('#critical')).toBeChecked();
        });
    });
});
