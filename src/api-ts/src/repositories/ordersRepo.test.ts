import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrdersRepository } from './ordersRepo';
import { closeDatabase, DatabaseConnection, getDatabase } from '../db/sqlite';
import { runMigrations } from '../db/migrate';
import { DatabaseError } from '../utils/errors';

describe('OrdersRepository order history', () => {
  let db: DatabaseConnection;
  let repository: OrdersRepository;

  beforeEach(async () => {
    await closeDatabase();
    db = await getDatabase(true);
    await runMigrations(true);
    repository = new OrdersRepository(db);
    await db.run("INSERT INTO headquarters (headquarters_id, name) VALUES (1, 'HQ')");
    await db.run(`INSERT INTO branches (branch_id, headquarters_id, name)
                  VALUES (1, 1, 'One'), (2, 1, 'Two'), (3, 1, 'Empty')`);
    await db.run("INSERT INTO suppliers (supplier_id, name) VALUES (1, 'Supplier')");
    await db.run(`INSERT INTO products (product_id, supplier_id, name, price, sku, unit)
                  VALUES (1, 1, 'Widget', 99, 'W', 'each'), (2, 1, 'Gadget', 50, 'G', 'each')`);
    await db.run(`INSERT INTO orders (order_id, branch_id, order_date, name, status)
                  VALUES (1, 1, '2026-01-01T00:00:00Z', 'Old', 'delivered'),
                         (2, 1, '2026-02-01T00:00:00Z', 'New', 'shipped'),
                         (3, 1, '2026-02-01T00:00:00Z', 'No items', 'pending'),
                         (4, 2, '2026-03-01T00:00:00Z', 'Other branch', 'processing')`);
    await db.run(`INSERT INTO order_details
                  (order_detail_id, order_id, product_id, quantity, unit_price, notes)
                  VALUES (1, 1, 1, 3, 0.1, NULL),
                         (2, 2, 1, 2, 12.5, 'Gift'),
                         (3, 2, 2, 3, 1.25, NULL),
                         (4, 4, 1, 1, 99, NULL)`);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await closeDatabase();
  });

  it('returns only branch orders newest first with deterministic date ties and complete line items', async () => {
    const query = vi.spyOn(db, 'all');
    const history = await repository.findHistoryByBranchId(1);

    expect(history.map((order) => order.orderId)).toEqual([3, 2, 1]);
    expect(history[1]).toEqual({
      orderId: 2,
      branchId: 1,
      orderDate: '2026-02-01T00:00:00Z',
      name: 'New',
      description: null,
      status: 'shipped',
      total: 28.75,
      orderDetails: [
        { orderDetailId: 2, orderId: 2, productId: 1, productName: 'Widget', quantity: 2, unitPrice: 12.5, notes: 'Gift' },
        { orderDetailId: 3, orderId: 2, productId: 2, productName: 'Gadget', quantity: 3, unitPrice: 1.25, notes: null },
      ],
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(expect.any(String), [1, 50, 0]);
  });

  it('keeps orders with no line items and gives them a zero total', async () => {
    const history = await repository.findHistoryByBranchId(1);
    expect(history[0]).toMatchObject({ orderId: 3, total: 0, orderDetails: [] });
  });

  it('uses historical unit prices and rounds floating point totals', async () => {
    await db.run('UPDATE products SET price = 999 WHERE product_id = 1');
    const history = await repository.findHistoryByBranchId(1);
    expect(history[2].total).toBe(0.3);
    expect(history[2].orderDetails[0].unitPrice).toBe(0.1);
  });

  it('paginates orders rather than joined line items', async () => {
    const history = await repository.findHistoryByBranchId(1, 1, 1);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ orderId: 2, total: 28.75 });
    expect(history[0].orderDetails).toHaveLength(2);
  });

  it('returns an empty array for empty branches, unknown branches, and exhausted pages', async () => {
    expect(await repository.findHistoryByBranchId(3)).toEqual([]);
    expect(await repository.findHistoryByBranchId(999)).toEqual([]);
    expect(await repository.findHistoryByBranchId(1, 1, 3)).toEqual([]);
  });

  it('propagates database failures through the shared error type', async () => {
    vi.spyOn(db, 'all').mockRejectedValueOnce(new Error('Read failed'));
    await expect(repository.findHistoryByBranchId(1)).rejects.toThrow(DatabaseError);
  });
});
