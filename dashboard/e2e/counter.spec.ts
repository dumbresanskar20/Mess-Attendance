import { test, expect } from '@playwright/test';

test.describe('Counter Screen E2E Flow', () => {
  test.beforeEach(async ({ page }) => {
    // 1. Navigate to login
    await page.goto('/login');

    // 2. Sign in as Owner or Counter
    await page.fill('input[type="email"]', 'owner@mess.local');
    await page.fill('input[type="password"]', 'Owner@123456');
    await page.click('button[type="submit"]');

    // Wait for navigation to dashboard
    await expect(page).toHaveURL('/');

    // 3. Navigate to Counter page
    await page.click('a[href="/counter"]');
    await expect(page).toHaveURL('/counter');
  });

  test('Flow 1: Simulate approved scan via MockDevice -> assert large green card, student name, balance, auto-reset after 4s', async ({ page }) => {
    // Check initial idle state
    await expect(page.locator('text=Waiting for fingerprint')).toBeVisible();

    // Trigger simulated scan for student 1 ('1_1')
    await page.fill('input[placeholder="e.g. 1_1 or 2_1"]', '1_1');
    await page.click('button:has-text("Simulate Scan")');

    // Assert large green card with student details
    const approvedCard = page.locator('.border-success-border, .bg-success-subtle');
    await expect(approvedCard).toBeVisible();
    await expect(page.locator('text=Meal Approved')).toBeVisible();
    await expect(page.locator('text=Aarav Sharma')).toBeVisible();
    await expect(page.locator('text=Tokens Remaining')).toBeVisible();

    // Assert auto-reset after 4s (plus small buffer)
    await page.waitForTimeout(4500);
    await expect(page.locator('text=Waiting for fingerprint')).toBeVisible();
  });

  test('Flow 2: Simulate rejected scan -> assert red card, reason displayed', async ({ page }) => {
    // Trigger simulated scan for inactive student 30 ('30_1')
    await page.fill('input[placeholder="e.g. 1_1 or 2_1"]', '30_1');
    await page.click('button:has-text("Simulate Scan")');

    // Assert red rejection card
    const rejectedCard = page.locator('.border-danger-border, .bg-danger-subtle');
    await expect(rejectedCard).toBeVisible();
    await expect(page.locator('text=Meal Rejected')).toBeVisible();
    await expect(page.locator('text=Inactive Student Account')).toBeVisible();
  });

  test('Flow 3: Manual meal marking fallback -> search student, select, enter mandatory reason, submit -> assert success card', async ({ page }) => {
    // Search student in fallback panel
    const searchInput = page.locator('input[placeholder="Search by student name, code, or phone..."]');
    await searchInput.fill('Sneha');

    // Select Sneha Deshmukh from search results dropdown
    const studentOption = page.locator('button:has-text("Sneha Deshmukh")');
    await expect(studentOption).toBeVisible();
    await studentOption.click();

    // Select reason for manual entry
    const reasonSelect = page.locator('select');
    await reasonSelect.selectOption({ value: 'WET_OR_OILY_FINGER' });

    // Enter optional note
    const noteInput = page.locator('input[placeholder="Optional detail (e.g. thumb injury)"]');
    await noteInput.fill('E2E automated test manual meal entry');

    // Click Confirm & Mark Meal button
    await page.click('button:has-text("Confirm & Mark Meal")');

    // Assert success card / confirmation appears
    await expect(page.locator('text=Meal Approved')).toBeVisible();
    await expect(page.locator('text=Sneha Deshmukh')).toBeVisible();
    await expect(page.locator('text=MANUAL')).toBeVisible();
  });
});
