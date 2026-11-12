import { test, expect } from '@playwright/test';

const branches = [
  { branchId: 1, name: 'Central branch' },
  { branchId: 2, name: 'Harbor branch' },
];

const order = {
  orderId: 42, branchId: 1, orderDate: '2026-11-01T12:00:00Z',
  name: 'Monthly supplies', description: null, status: 'delivered', total: 25,
  orderDetails: [
    { orderDetailId: 1, orderId: 42, productId: 1, productName: 'SmartFeeder One', quantity: 2, unitPrice: 12.5, notes: null },
  ],
};

test.describe('Order history', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/branches', (route) => route.fulfill({ json: branches }));
  });

  test('navigate to history and open an order with historical line items', async ({ page }) => {
    await page.route('**/api/orders?**', (route) => {
      expect(new URL(route.request().url()).searchParams.get('branchId')).toBe('1');
      return route.fulfill({ json: [order] });
    });
    await page.goto('/');
    await page.getByRole('link', { name: 'Order history', exact: true }).click();
    await expect(page).toHaveURL(/\/orders$/);
    await expect(page.getByRole('heading', { name: 'Order history', exact: true })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Select a branch');
    await page.getByLabel('Branch', { exact: true }).selectOption('1');
    const receipt = page.locator('details');
    await expect(receipt.locator('summary')).toContainText('Order #42');
    await expect(receipt.locator('time')).toHaveAttribute('datetime', order.orderDate);
    await expect(receipt.locator('summary')).toContainText('delivered');
    await expect(receipt.locator('summary')).toContainText('$25.00');
    await expect(page.getByRole('table')).not.toBeVisible();
    await receipt.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('row', { name: 'SmartFeeder One 2 $12.50' })).toBeVisible();
  });

  test('show loading and empty states without stale orders after changing branches', async ({ page }) => {
    let releaseLoading: () => void = () => { throw new Error('Loading barrier not initialized'); };
    const loadingBarrier = new Promise<void>((resolve) => { releaseLoading = resolve; });
    await page.route('**/api/orders?**', async (route) => {
      if (new URL(route.request().url()).searchParams.get('branchId') === '1') {
        await route.fulfill({ json: [order] });
      } else {
        await loadingBarrier;
        await route.fulfill({ json: [] });
      }
    });
    await page.goto('/orders');
    await page.getByLabel('Branch', { exact: true }).selectOption('1');
    await expect(page.locator('summary')).toContainText('Order #42');
    await page.getByLabel('Branch', { exact: true }).selectOption('2');
    await expect(page.getByRole('status')).toContainText('Loading order history');
    await expect(page.locator('summary')).toHaveCount(0);
    releaseLoading();
    await expect(page.getByRole('heading', { name: 'No orders yet' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Browse products' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Older orders' })).toBeDisabled();
  });

  test('retry a failed history request', async ({ page }) => {
    let fail = true;
    await page.route('**/api/orders?**', (route) => route.fulfill(
      fail ? { status: 500, json: { error: { code: 'DATABASE_ERROR' } } } : { json: [order] },
    ));
    await page.goto('/orders');
    await page.getByLabel('Branch', { exact: true }).selectOption('1');
    await expect(page.getByRole('alert')).toContainText('Could not load order history');
    await expect(page.getByRole('heading', { name: 'No orders yet' })).toHaveCount(0);
    fail = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.locator('summary')).toContainText('Order #42');
  });

  test('handle branch loading failures and no available branches', async ({ page }) => {
    let fail = true;
    await page.route('**/api/branches', (route) => route.fulfill(
      fail ? { status: 500, json: {} } : { json: [] },
    ));
    await page.goto('/orders');
    await expect(page.getByRole('alert')).toContainText('Could not load branches');
    fail = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('status')).toHaveText('No branches available.');
  });

  test('paginate and reset the page when changing branches', async ({ page }) => {
    await page.route('**/api/orders?**', (route) => {
      const params = new URL(route.request().url()).searchParams;
      expect(params.get('limit')).toBe('20');
      const firstPage = Array.from({ length: 20 }, (_, i) => ({ ...order, orderId: i + 1 }));
      return route.fulfill({ json: params.get('offset') === '0' ? firstPage : [{ ...order, orderId: 99 }] });
    });
    await page.goto('/orders');
    await page.getByLabel('Branch', { exact: true }).selectOption('1');
    await expect(page.locator('summary')).toHaveCount(20);
    await page.getByRole('button', { name: 'Older orders' }).click();
    await expect(page.getByText('Page 2', { exact: true })).toBeVisible();
    await expect(page.locator('summary')).toHaveCount(1);
    await expect(page.locator('summary')).toContainText('Order #99');
    await page.getByRole('button', { name: 'Newer orders' }).click();
    await expect(page.locator('summary')).toHaveCount(20);
    await page.getByRole('button', { name: 'Older orders' }).click();
    await expect(page.getByText('Page 2', { exact: true })).toBeVisible();
    await page.getByLabel('Branch', { exact: true }).selectOption('2');
    await expect(page.getByText('Page 1', { exact: true })).toBeVisible();
    await expect(page.locator('summary')).toHaveCount(20);
  });

  for (const width of [320, 640, 768, 1280]) {
    test(`history is accessible and fits a ${width}px viewport`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.route('**/api/orders?**', (route) => route.fulfill({ json: [order] }));
      await page.goto('/');
      await page.getByRole('link', { name: 'Order history', exact: true }).click();
      await page.getByLabel('Branch', { exact: true }).selectOption('1');
      await page.locator('summary').click();
      await expect(page.getByRole('table')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (width === 320) {
        await page.screenshot({ path: test.info().outputPath('order-history-mobile.png'), fullPage: true });
      }
      if (width === 1280) {
        await page.screenshot({ path: test.info().outputPath('order-history-desktop.png'), fullPage: true });
      }
    });
  }
});

test('order history reads actual orders from the TypeScript backend', async ({ page, request }) => {
  const apiUrl = process.env.ORDER_HISTORY_API_URL ?? 'http://localhost:3000';
  const branchResponse = await request.get(`${apiUrl}/api/branches`);
  expect(branchResponse.ok()).toBe(true);
  const liveBranches: { branchId: number; name: string }[] = await branchResponse.json();
  expect(liveBranches.length).toBeGreaterThan(0);
  const productResponse = await request.get(`${apiUrl}/api/products`);
  expect(productResponse.ok()).toBe(true);
  const products: { productId: number; name: string }[] = await productResponse.json();
  expect(products.length).toBeGreaterThan(0);
  const createdResponse = await request.post(`${apiUrl}/api/orders`, {
    data: {
      branchId: liveBranches[0].branchId, orderDate: new Date().toISOString(),
      name: 'E2E order history', description: 'Browser test fixture', status: 'delivered',
    },
  });
  expect(createdResponse.status()).toBe(201);
  const created: { orderId: number } = await createdResponse.json();
  try {
    const detailResponse = await request.post(`${apiUrl}/api/order-details`, {
      data: { orderId: created.orderId, productId: products[0].productId, quantity: 2, unitPrice: 12.5, notes: 'Browser test fixture' },
    });
    expect(detailResponse.status()).toBe(201);
    await page.goto('/orders');
    await page.getByLabel('Branch', { exact: true }).selectOption(String(liveBranches[0].branchId));
    const receipt = page.locator('details').filter({ has: page.getByText(`Order #${created.orderId}`, { exact: true }) });
    await expect(receipt.locator('summary')).toContainText('delivered');
    await expect(receipt.locator('summary')).toContainText('$25.00');
    await receipt.locator('summary').click();
    await expect(receipt.getByRole('table')).toBeVisible();
    await expect(receipt.getByRole('row', { name: `${products[0].name} 2 $12.50` })).toBeVisible();
  } finally {
    const deletedResponse = await request.delete(`${apiUrl}/api/orders/${created.orderId}`);
    expect(deletedResponse.status()).toBe(204);
  }
});
