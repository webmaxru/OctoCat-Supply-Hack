import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import orderRouter from './order';
import { closeDatabase, getDatabase } from '../db/sqlite';
import { runMigrations } from '../db/migrate';
import { errorHandler } from '../utils/errors';

describe('Order history API', () => {
  let app: express.Express;

  beforeEach(async () => {
    await closeDatabase();
    const db = await getDatabase(true);
    await runMigrations(true);
    await db.run("INSERT INTO headquarters (headquarters_id, name) VALUES (1, 'HQ')");
    await db.run(`INSERT INTO branches (branch_id, headquarters_id, name)
                  VALUES (1, 1, 'One'), (2, 1, 'Two'), (3, 1, 'Empty')`);
    await db.run("INSERT INTO suppliers (supplier_id, name) VALUES (1, 'Supplier')");
    await db.run(`INSERT INTO products (product_id, supplier_id, name, price, sku, unit)
                  VALUES (1, 1, 'Widget', 99, 'W', 'each')`);
    await db.run(`INSERT INTO orders (order_id, branch_id, order_date, name, status)
                  VALUES (1, 1, '2026-01-01T00:00:00Z', 'Old', 'delivered'),
                         (2, 1, '2026-02-01T00:00:00Z', 'New', 'pending'),
                         (3, 2, '2026-03-01T00:00:00Z', 'Other branch', 'shipped')`);
    await db.run(`INSERT INTO order_details (order_id, product_id, quantity, unit_price)
                  VALUES (1, 1, 2, 12.5), (1, 1, 1, 5), (3, 1, 1, 99)`);
    app = express();
    app.use(express.json());
    app.use('/api/orders', orderRouter);
    app.use(errorHandler);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await closeDatabase();
  });

  it('returns branch-scoped history including date, status, total and line items', async () => {
    const response = await request(app).get('/api/orders?branchId=1');
    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        orderId: 2, branchId: 1, orderDate: '2026-02-01T00:00:00Z',
        name: 'New', description: null, status: 'pending', total: 0, orderDetails: [],
      },
      {
        orderId: 1, branchId: 1, orderDate: '2026-01-01T00:00:00Z',
        name: 'Old', description: null, status: 'delivered', total: 30,
        orderDetails: [
          { orderDetailId: 1, orderId: 1, productId: 1, productName: 'Widget', quantity: 2, unitPrice: 12.5, notes: null },
          { orderDetailId: 2, orderId: 1, productId: 1, productName: 'Widget', quantity: 1, unitPrice: 5, notes: null },
        ],
      },
    ]);
  });

  it('returns a full order when paginating', async () => {
    const response = await request(app).get('/api/orders?branchId=1&limit=1&offset=1');
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ orderId: 1, total: 30 });
    expect(response.body[0].orderDetails).toHaveLength(2);
  });

  it.each(['branchId=3', 'branchId=999', 'branchId=1&offset=2'])('returns an empty history for %s', async (query) => {
    const response = await request(app).get(`/api/orders?${query}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it.each([
    'branchId=', 'branchId=0', 'branchId=-1', 'branchId=1.5', 'branchId=1abc',
    'branchId=abc', 'branchId=1e2', 'branchId=9007199254740992',
    'branchId=1&branchId=2', 'branchId=1%20OR%201=1',
    'branchId=1&limit=0', 'branchId=1&limit=101', 'branchId=1&limit=abc',
    'branchId=1&limit=1&limit=2', 'branchId=1&limit=',
    'branchId=1&offset=-1', 'branchId=1&offset=1.5', 'branchId=1&offset=abc',
    'branchId=1&offset=9007199254740992', 'branchId=1&offset=',
    'limit=10', 'offset=0',
  ])('rejects invalid history parameters: %s', async (query) => {
    const response = await request(app).get(`/api/orders?${query}`);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts the pagination boundaries', async () => {
    const response = await request(app).get('/api/orders?branchId=1&limit=100&offset=0');
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
  });

  it('preserves the unfiltered list and single-order response shapes', async () => {
    const list = await request(app).get('/api/orders');
    expect(list.status).toBe(200);
    expect(list.body.map((order: { orderId: number }) => order.orderId)).toEqual([1, 2, 3]);
    expect(list.body[0]).not.toHaveProperty('orderDetails');
    expect(list.body[0]).not.toHaveProperty('total');
    const single = await request(app).get('/api/orders/1');
    expect(single.status).toBe(200);
    expect(single.body).toEqual(list.body[0]);
    expect((await request(app).get('/api/orders/999')).status).toBe(404);
  });

  it('returns a structured error when the history query fails', async () => {
    const db = await getDatabase(true);
    vi.spyOn(db, 'all').mockRejectedValueOnce(new Error('Read failed'));
    const response = await request(app).get('/api/orders?branchId=1');
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('DATABASE_ERROR');
  });
});
