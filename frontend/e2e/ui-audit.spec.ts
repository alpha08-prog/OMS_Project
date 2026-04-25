import { test, type Page } from '@playwright/test';
import path from 'path';

const ADMIN_USER = { name: 'System Administrator', role: 'ADMIN', id: 'admin-1', email: 'admin@test.com' };
const STAFF_USER = { name: 'Staff Member', role: 'STAFF', id: 'staff-1', email: 'staff@test.com' };

async function injectAuth(page: Page, user: typeof ADMIN_USER) {
  await page.addInitScript((u) => {
    const token = 'mock_token';
    const userStr = JSON.stringify(u);
    sessionStorage.setItem('auth_token', token);
    sessionStorage.setItem('auth_session', '1');
    sessionStorage.setItem('user_role', u.role);
    sessionStorage.setItem('user', userStr);
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_session', '1');
    localStorage.setItem('user_role', u.role);
    localStorage.setItem('user', userStr);
  }, user);
}

async function mockAllApis(page: Page) {
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
  const emptyList = { success: true, data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } };
  const emptyListNoMeta = { success: true, data: [] };

  await page.route('**/api/**', (route) => {
    const url = route.request().url();
    if (url.includes('/stats/summary')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(statsPayload) });
    if (url.includes('/birthdays')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(emptyListNoMeta) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(emptyList) });
  });
}

const screenshotDir = './test-results/ui-audit';

test.use({ viewport: { width: 1440, height: 900 } });

test.describe('UI Audit - All Pages', () => {

  test('01 - Auth Login page', async ({ page }) => {
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotDir, '01-login.png'), fullPage: true });
  });

  test('02 - Auth Signup page', async ({ page }) => {
    await page.goto('/auth/signup');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotDir, '02-signup.png'), fullPage: true });
  });

  test('03 - Admin Home Dashboard', async ({ page }) => {
    await injectAuth(page, ADMIN_USER);
    await mockAllApis(page);
    await page.goto('/admin/home');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotDir, '03-admin-home.png'), fullPage: true });
  });

  test('04 - Admin Action Center', async ({ page }) => {
    await injectAuth(page, ADMIN_USER);
    await mockAllApis(page);
    await page.goto('/admin/action-center');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotDir, '04-admin-action-center.png'), fullPage: true });
  });

  test('05 - Admin Task Tracker', async ({ page }) => {
    await injectAuth(page, ADMIN_USER);
    await mockAllApis(page);
    await page.goto('/admin/task-tracker');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotDir, '05-admin-task-tracker.png'), fullPage: true });
  });

  test('06 - Admin History', async ({ page }) => {
    await injectAuth(page, ADMIN_USER);
    await mockAllApis(page);
    await page.goto('/admin/history');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotDir, '06-admin-history.png'), fullPage: true });
  });

  test('07 - Admin Birthdays', async ({ page }) => {
    await injectAuth(page, ADMIN_USER);
    await mockAllApis(page);
    await page.goto('/admin/birthdays');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotDir, '07-admin-birthdays.png'), fullPage: true });
  });

  test('08 - Admin Print Center', async ({ page }) => {
    await injectAuth(page, ADMIN_USER);
    await mockAllApis(page);
    await page.goto('/admin/print-center');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotDir, '08-admin-print.png'), fullPage: true });
  });

  test('09 - Admin Calendar', async ({ page }) => {
    await injectAuth(page, ADMIN_USER);
    await mockAllApis(page);
    await page.goto('/admin/calendar');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotDir, '09-admin-calendar.png'), fullPage: true });
  });

  test('10 - Admin View Visitors', async ({ page }) => {
    await injectAuth(page, ADMIN_USER);
    await mockAllApis(page);
    await page.goto('/admin/visitors');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotDir, '10-admin-visitors.png'), fullPage: true });
  });

  test('11 - Grievance Verification Queue', async ({ page }) => {
    await injectAuth(page, ADMIN_USER);
    await mockAllApis(page);
    await page.goto('/grievances/verify');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotDir, '11-grievance-verify.png'), fullPage: true });
  });

  test('12 - Train EQ Queue', async ({ page }) => {
    await injectAuth(page, ADMIN_USER);
    await mockAllApis(page);
    await page.goto('/train-eq/queue');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotDir, '12-train-eq-queue.png'), fullPage: true });
  });

  test('13 - Tour Program Pending', async ({ page }) => {
    await injectAuth(page, ADMIN_USER);
    await mockAllApis(page);
    await page.goto('/tour-program/pending');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotDir, '13-tour-program-queue.png'), fullPage: true });
  });

  test('14 - News Intelligence View', async ({ page }) => {
    await injectAuth(page, ADMIN_USER);
    await mockAllApis(page);
    await page.goto('/news/view');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotDir, '14-news-view.png'), fullPage: true });
  });

  test('15 - Admin Events View', async ({ page }) => {
    await injectAuth(page, ADMIN_USER);
    await mockAllApis(page);
    await page.goto('/admin/events');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotDir, '15-admin-events.png'), fullPage: true });
  });

  test('16 - Staff Home', async ({ page }) => {
    await injectAuth(page, STAFF_USER);
    await mockAllApis(page);
    await page.goto('/staff/home');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotDir, '16-staff-home.png'), fullPage: true });
  });

  test('17 - Staff Tasks', async ({ page }) => {
    await injectAuth(page, STAFF_USER);
    await mockAllApis(page);
    await page.goto('/staff/tasks');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotDir, '17-staff-tasks.png'), fullPage: true });
  });

  test('18 - Staff History', async ({ page }) => {
    await injectAuth(page, STAFF_USER);
    await mockAllApis(page);
    await page.goto('/staff/history');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotDir, '18-staff-history.png'), fullPage: true });
  });

  test('19 - Grievance Create (Staff)', async ({ page }) => {
    await injectAuth(page, STAFF_USER);
    await mockAllApis(page);
    await page.goto('/grievances/new');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotDir, '19-grievance-create.png'), fullPage: true });
  });

  test('20 - Office Grievance Create (Staff)', async ({ page }) => {
    await injectAuth(page, STAFF_USER);
    await mockAllApis(page);
    await page.goto('/grievances/office');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotDir, '20-grievance-office.png'), fullPage: true });
  });

  test('21 - Visitor Create (Staff)', async ({ page }) => {
    await injectAuth(page, STAFF_USER);
    await mockAllApis(page);
    await page.goto('/visitors/new');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotDir, '21-visitor-create.png'), fullPage: true });
  });

  test('22 - Birthday Create (Staff)', async ({ page }) => {
    await injectAuth(page, STAFF_USER);
    await mockAllApis(page);
    await page.goto('/birthday/new');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotDir, '22-birthday-create.png'), fullPage: true });
  });

  test('23 - News Intelligence Create (Staff)', async ({ page }) => {
    await injectAuth(page, STAFF_USER);
    await mockAllApis(page);
    await page.goto('/news-intelligence/new');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotDir, '23-news-create.png'), fullPage: true });
  });

  test('24 - Tour Program Create (Staff)', async ({ page }) => {
    await injectAuth(page, STAFF_USER);
    await mockAllApis(page);
    await page.goto('/tour-program/new');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotDir, '24-tour-create.png'), fullPage: true });
  });

  test('25 - Train EQ Create (Staff)', async ({ page }) => {
    await injectAuth(page, STAFF_USER);
    await mockAllApis(page);
    await page.goto('/train-eq/new');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotDir, '25-train-eq-create.png'), fullPage: true });
  });

  test('26 - Event Report Create (Staff)', async ({ page }) => {
    await injectAuth(page, STAFF_USER);
    await mockAllApis(page);
    await page.goto('/events/report');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotDir, '26-event-report.png'), fullPage: true });
  });

  test('27 - Visitor View (Admin)', async ({ page }) => {
    await injectAuth(page, ADMIN_USER);
    await mockAllApis(page);
    await page.goto('/visitors/view');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotDir, '27-visitor-view.png'), fullPage: true });
  });

  test('28 - About Us', async ({ page }) => {
    await page.goto('/about');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotDir, '28-about.png'), fullPage: true });
  });

  test('29 - Mobile Login', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotDir, '29-mobile-login.png'), fullPage: true });
  });

  test('30 - Mobile Admin Home', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await injectAuth(page, ADMIN_USER);
    await mockAllApis(page);
    await page.goto('/admin/home');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotDir, '30-mobile-admin-home.png'), fullPage: true });
  });

  test('31 - Mobile Staff Home', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await injectAuth(page, STAFF_USER);
    await mockAllApis(page);
    await page.goto('/staff/home');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotDir, '31-mobile-staff-home.png'), fullPage: true });
  });

  test('32 - Mobile Grievance Create', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await injectAuth(page, STAFF_USER);
    await mockAllApis(page);
    await page.goto('/grievances/new');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotDir, '32-mobile-grievance-create.png'), fullPage: true });
  });

  test('33 - Tablet Admin Home', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await injectAuth(page, ADMIN_USER);
    await mockAllApis(page);
    await page.goto('/admin/home');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotDir, '33-tablet-admin-home.png'), fullPage: true });
  });

});
