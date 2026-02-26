import { test, expect } from '@playwright/test';

test.describe('Staff Form Tests', () => {
    // Run before each test to mock being logged in as STAFF
    test.beforeEach(async ({ page }) => {
        // Go to root page to initialize storage context
        await page.goto('/');

        // Inject mock session data to bypass login screen
        await page.evaluate(() => {
            sessionStorage.setItem('auth_token', 'mock_token');
            sessionStorage.setItem('auth_session', '1');
            localStorage.setItem('user_role', 'STAFF');
            sessionStorage.setItem('user_role', 'STAFF');
            sessionStorage.setItem('user_name', 'Test Staff Member');
        });
    });

    test.describe('Visitor Create Form', () => {
        test.beforeEach(async ({ page }) => {
            await page.goto('/visitors/new');
        });

        test('should display required field validation errors', async ({ page }) => {
            // Click the submit button without filling anything
            const submitBtn = page.getByRole('button', { name: /Log Visitor/i });
            await submitBtn.click();

            // Ensure validation errors show up and are properly chained
            await expect(page.getByText('Visitor name is required')).toBeVisible();

            // Fill the first field and try again to see next validation
            await page.getByPlaceholder('Enter visitor full name').fill('John Doe');
            await submitBtn.click();

            await expect(page.getByText('Please select a designation')).toBeVisible();
        });

        test('should allow typing in all fields successfully', async ({ page }) => {
            await page.getByPlaceholder('Enter visitor full name').fill('Jane Doe');

            // Select Designation
            await page.getByRole('combobox').click();
            await page.getByRole('option', { name: 'Public' }).click();

            await page.getByPlaceholder('10-digit mobile number').fill('9876543210');

            await page.getByPlaceholder('Eg: Local Leader, Office Staff').fill('Local MLA');

            await page.getByPlaceholder('Enter purpose of visit').fill('To discuss housing project timeline in the local area.');

            // Check values
            await expect(page.getByPlaceholder('Enter visitor full name')).toHaveValue('Jane Doe');
            await expect(page.getByPlaceholder('10-digit mobile number')).toHaveValue('9876543210');
        });
    });

    test.describe('Grievance Create Form', () => {
        test.beforeEach(async ({ page }) => {
            await page.goto('/grievances/new');
        });

        test('should validate the mobile number properly', async ({ page }) => {
            // Fill just name and bad mobile number
            await page.getByPlaceholder('Enter full name').fill('Rahul Singh');
            // Invalid length phone number
            await page.getByPlaceholder('10-digit mobile number').fill('12345');

            await page.getByRole('button', { name: /Register Grievance/i }).click();

            // Mobile validation error should show up
            await expect(page.getByText('Please enter a valid 10-digit mobile number')).toBeVisible();
        });

        test('should show validation on missing referencedBy field', async ({ page }) => {
            await page.getByPlaceholder('Enter full name').fill('Rahul Singh');
            await page.getByPlaceholder('10-digit mobile number').fill('9876543210');

            // Choose constituency
            await page.getByRole('combobox').first().click();
            await page.getByRole('option', { name: 'Central' }).click();

            // Choose grievance type
            await page.getByRole('combobox').nth(1).click();
            await page.getByRole('option', { name: 'Road' }).click();

            // Add desc
            await page.getByPlaceholder('Enter detailed description of the grievance').fill('The main road is broken near the station.');

            // Submit WITHOUT ReferencedBy
            await page.getByRole('button', { name: /Register Grievance/i }).click();

            // Check error
            await expect(page.getByText('Referenced By field is mandatory')).toBeVisible();
        });
    });
});
