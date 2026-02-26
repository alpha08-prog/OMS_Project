import { test, expect } from '@playwright/test';

test.describe('Admin Dashboard Tests', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to root to initialize storage context
        await page.goto('/');

        // Inject mock session data to bypass login screen as ADMIN
        await page.evaluate(() => {
            sessionStorage.setItem('auth_token', 'mock_admin_token');
            sessionStorage.setItem('auth_session', '1');
            localStorage.setItem('user_role', 'ADMIN');
            sessionStorage.setItem('user_role', 'ADMIN');
            sessionStorage.setItem('user_name', 'System Administrator');
            localStorage.setItem('user', JSON.stringify({ name: 'System Administrator', role: 'ADMIN' }));
            sessionStorage.setItem('user', JSON.stringify({ name: 'System Administrator', role: 'ADMIN' }));
        });
    });

    test.describe('Admin Home Dashboard', () => {
        test.beforeEach(async ({ page }) => {
            await page.goto('/admin/home');
        });

        test('should properly render the admin home interface and access badge', async ({ page }) => {
            // Check the greeting
            await expect(page.getByText('Welcome, System Administrator')).toBeVisible();

            // Check the access badge
            await expect(page.getByText('ADMIN ACCESS')).toBeVisible();

            // Check the primary command center cards
            await expect(page.getByRole('heading', { name: 'Verify Grievances' })).toBeVisible();
            await expect(page.getByRole('heading', { name: 'Print Letters' })).toBeVisible();
            await expect(page.getByRole('heading', { name: 'Train EQ Letters' })).toBeVisible();
            await expect(page.getByRole('heading', { name: 'Tour Decisions' })).toBeVisible();

            // Check for pending table
            await expect(page.getByRole('heading', { name: 'Pending Approvals' })).toBeVisible();
        });

        test('should allow navigation to queues directly from dashboard cards', async ({ page }) => {
            // Intercept navigation or check if the button works
            const openQueueBtn = page.getByRole('button', { name: 'Open Queue' });
            await openQueueBtn.click();
            await expect(page).toHaveURL(/.*\/grievances\/verify/);
        });
    });

    test.describe('Admin Queue Pages Render Successfully', () => {
        // We just verify these load without blank screens
        test('/train-eq/queue loads successfully', async ({ page }) => {
            await page.goto('/train-eq/queue');
            const heading = page.getByRole('heading', { name: /Train EQ Requests/i });
            await expect(heading).toBeVisible();
        });

        test('/tour-program/pending loads successfully', async ({ page }) => {
            await page.goto('/tour-program/pending');
            const heading = page.getByRole('heading', { name: /Tour Program Queue/i });
            await expect(heading).toBeVisible();
        });

        test('/admin/visitors loads successfully', async ({ page }) => {
            await page.goto('/admin/visitors');
            const heading = page.getByRole('heading', { name: /View Visitors/i });
            await expect(heading).toBeVisible();
        });
    });
});
