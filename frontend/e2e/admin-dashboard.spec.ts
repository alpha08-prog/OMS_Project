import { test, expect, type Page } from '@playwright/test';

const ADMIN_USER = { name: 'System Administrator', role: 'ADMIN', id: 'admin-1', email: 'admin@test.com' };

/** Inject auth tokens before page load so ProtectedRoute passes */
async function injectAdminAuth(page: Page) {
  await page.addInitScript((user) => {
    const token = 'mock_admin_token';
    const userStr = JSON.stringify(user);
    sessionStorage.setItem('auth_token', token);
    sessionStorage.setItem('auth_session', '1');
    sessionStorage.setItem('user_role', user.role);
    sessionStorage.setItem('user', userStr);
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_session', '1');
    localStorage.setItem('user_role', user.role);
    localStorage.setItem('user', userStr);
  }, ADMIN_USER);
}

/** Mock all backend API calls so 401 interceptor never fires */
async function mockApiRoutes(page: Page) {
  const statsPayload = {
    success: true, message: 'ok',
    data: {
      grievances: { total: 10, open: 3, inProgress: 2, verified: 1, resolved: 4, pendingVerification: 5 },
      visitors: { total: 20, today: 2 },
      trainRequests: { total: 5, pending: 1, approved: 3 },
      news: { total: 8, critical: 1 },
      tourPrograms: { total: 6, upcoming: 2, pending: 1 },
      birthdays: { today: 0 },
    },
  };

  await page.route('**/api/stats/summary', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(statsPayload) })
  );
  await page.route('**/api/grievances**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], meta: { total: 0, page: 1, limit: 5, totalPages: 0 } }) })
  );
  await page.route('**/api/train-requests**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], meta: { total: 0, page: 1, limit: 5, totalPages: 0 } }) })
  );
  await page.route('**/api/tour-programs**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], meta: { total: 0, page: 1, limit: 5, totalPages: 0 } }) })
  );
  await page.route('**/api/birthdays**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) })
  );
  await page.route('**/api/visitors**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } }) })
  );
}

test.describe('Admin Dashboard Tests', () => {
  test.describe('Admin Home Dashboard', () => {
    test.beforeEach(async ({ page }) => {
      await injectAdminAuth(page);
      await mockApiRoutes(page);
      await page.goto('/admin/home');
    });

    test('should properly render the admin home interface and access badge', async ({ page }) => {
      await expect(page.getByText('Welcome, System Administrator')).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('ADMIN ACCESS')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Verify Grievances' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Print Letters' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Train EQ Letters' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Tour Decisions' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Pending Approvals' })).toBeVisible();
    });

    test('should show pending counts from stats', async ({ page }) => {
      // Stats are mocked: pendingVerification=5, train pending=1, tour pending=1
      await expect(page.getByText(/5 pending verification/i)).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(/1 pending approval/i)).toBeVisible();
      await expect(page.getByText(/1 pending decisions/i)).toBeVisible();
    });

    test('should allow navigation to verify grievances queue', async ({ page }) => {
      const openQueueBtn = page.getByRole('button', { name: 'Open Queue' });
      await expect(openQueueBtn).toBeVisible({ timeout: 10000 });
      await openQueueBtn.click();
      await expect(page).toHaveURL(/.*\/grievances\/verify/, { timeout: 5000 });
    });
  });

  test.describe('Admin Queue Pages Render Successfully', () => {
    test('/train-eq/queue loads successfully', async ({ page }) => {
      await injectAdminAuth(page);
      await mockApiRoutes(page);
      await page.goto('/train-eq/queue');
      await expect(page.getByRole('heading', { name: /Train EQ Requests/i })).toBeVisible({ timeout: 10000 });
    });

    test('/tour-program/pending loads successfully', async ({ page }) => {
      await injectAdminAuth(page);
      await mockApiRoutes(page);
      await page.goto('/tour-program/pending');
      // Match either "Tour Invitations" or "Tour Program Queue" heading
      await expect(page.getByRole('heading', { name: /Tour (Invitations|Program Queue)/i })).toBeVisible({ timeout: 10000 });
    });

    test('/admin/visitors loads successfully', async ({ page }) => {
      await injectAdminAuth(page);
      await mockApiRoutes(page);
      await page.goto('/admin/visitors');
      await expect(page.getByRole('heading', { name: /View Visitors/i })).toBeVisible({ timeout: 10000 });
    });
  });
});
