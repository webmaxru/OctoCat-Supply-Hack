/**
 * Repository for orders data access
 */

import { getDatabase, DatabaseConnection } from '../db/sqlite';
import { Order } from '../models/order';
import { OrderHistory } from '../models/orderHistory';
import { handleDatabaseError, NotFoundError } from '../utils/errors';
import { buildInsertSQL, buildUpdateSQL, objectToCamelCase, mapDatabaseRows, DatabaseRow } from '../utils/sql';

interface OrderHistoryRow extends Omit<OrderHistory, 'total' | 'orderDetails'> {
  orderDetailId: number | null;
  productId: number | null;
  productName: string | null;
  quantity: number | null;
  unitPrice: number | null;
  notes: string | null;
}

export class OrdersRepository {
  private db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  /**
   * Get all orders
   */
  async findAll(): Promise<Order[]> {
    try {
      const rows = await this.db.all<DatabaseRow>('SELECT * FROM orders ORDER BY order_id');
      return mapDatabaseRows<Order>(rows);
    } catch (error) {
      handleDatabaseError(error);
    }
  }

  /**
   * Get order by ID
   */
  async findById(id: number): Promise<Order | null> {
    try {
      const row = await this.db.get<DatabaseRow>('SELECT * FROM orders WHERE order_id = ?', [id]);
      return row ? objectToCamelCase<Order>(row) : null;
    } catch (error) {
      handleDatabaseError(error);
    }
  }

  /**
   * Create a new order
   */
  async create(order: Omit<Order, 'orderId'>): Promise<Order> {
    try {
      const { sql, values } = buildInsertSQL('orders', order);
      const result = await this.db.run(sql, values);

      const createdOrder = await this.findById(result.lastID || 0);
      if (!createdOrder) {
        throw new Error('Failed to retrieve created order');
      }

      return createdOrder;
    } catch (error) {
      handleDatabaseError(error);
    }
  }

  /**
   * Update order by ID
   */
  async update(id: number, order: Partial<Omit<Order, 'orderId'>>): Promise<Order> {
    try {
      const { sql, values } = buildUpdateSQL('orders', order, 'order_id = ?');
      const result = await this.db.run(sql, [...values, id]);

      if (result.changes === 0) {
        throw new NotFoundError('Order', id);
      }

      const updatedOrder = await this.findById(id);
      if (!updatedOrder) {
        throw new Error('Failed to retrieve updated order');
      }

      return updatedOrder;
    } catch (error) {
      handleDatabaseError(error, 'Order', id);
    }
  }

  /**
   * Delete order by ID
   */
  async delete(id: number): Promise<void> {
    try {
      const result = await this.db.run('DELETE FROM orders WHERE order_id = ?', [id]);

      if (result.changes === 0) {
        throw new NotFoundError('Order', id);
      }
    } catch (error) {
      handleDatabaseError(error, 'Order', id);
    }
  }

  /**
   * Check if order exists
   */
  async exists(id: number): Promise<boolean> {
    try {
      const result = await this.db.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM orders WHERE order_id = ?',
        [id],
      );
      return (result?.count || 0) > 0;
    } catch (error) {
      handleDatabaseError(error);
    }
  }

  /**
   * Find orders by branch ID
   */
  async findByBranchId(branchId: number): Promise<Order[]> {
    try {
      const rows = await this.db.all<DatabaseRow>(
        'SELECT * FROM orders WHERE branch_id = ? ORDER BY order_date DESC',
        [branchId],
      );
      return mapDatabaseRows<Order>(rows);
    } catch (error) {
      handleDatabaseError(error);
    }
  }

  async findHistoryByBranchId(branchId: number, limit: number = 50, offset: number = 0): Promise<OrderHistory[]> {
    try {
      // Page orders before joining so an order's line items are never split across pages.
      const rows = await this.db.all<OrderHistoryRow>(
        `SELECT o.order_id AS orderId, o.branch_id AS branchId, o.order_date AS orderDate,
                o.name, o.description, o.status, d.order_detail_id AS orderDetailId,
                d.product_id AS productId, p.name AS productName, d.quantity,
                d.unit_price AS unitPrice, d.notes
         FROM (
           SELECT * FROM orders WHERE branch_id = ?
           ORDER BY order_date DESC, order_id DESC LIMIT ? OFFSET ?
         ) o
         LEFT JOIN order_details d ON d.order_id = o.order_id
         LEFT JOIN products p ON p.product_id = d.product_id
         ORDER BY o.order_date DESC, o.order_id DESC, d.order_detail_id`,
        [branchId, limit, offset],
      );
      const orders = new Map<number, OrderHistory>();
      for (const row of rows) {
        let order = orders.get(row.orderId);
        if (!order) {
          order = {
            orderId: row.orderId,
            branchId: row.branchId,
            orderDate: row.orderDate,
            name: row.name,
            description: row.description,
            status: row.status,
            total: 0,
            orderDetails: [],
          };
          orders.set(row.orderId, order);
        }
        if (row.orderDetailId !== null) {
          if (row.productId === null || row.productName === null ||
              row.quantity === null || row.unitPrice === null) {
            throw new Error(`Incomplete order detail ${row.orderDetailId}`);
          }
          order.orderDetails.push({
            orderDetailId: row.orderDetailId,
            orderId: row.orderId,
            productId: row.productId,
            productName: row.productName,
            quantity: row.quantity,
            unitPrice: row.unitPrice,
            notes: row.notes,
          });
          order.total += row.quantity * row.unitPrice;
        }
      }
      return Array.from(orders.values(), (order) => ({
        ...order,
        total: Math.round((order.total + Number.EPSILON) * 100) / 100,
      }));
    } catch (error) {
      handleDatabaseError(error);
    }
  }

  /**
   * Find orders by status
   */
  async findByStatus(status: string): Promise<Order[]> {
    try {
      const rows = await this.db.all<DatabaseRow>(
        'SELECT * FROM orders WHERE status = ? ORDER BY order_date DESC',
        [status],
      );
      return mapDatabaseRows<Order>(rows);
    } catch (error) {
      handleDatabaseError(error);
    }
  }

  /**
   * Find orders by date range
   */
  async findByDateRange(startDate: string, endDate: string): Promise<Order[]> {
    try {
      const rows = await this.db.all<DatabaseRow>(
        'SELECT * FROM orders WHERE order_date >= ? AND order_date <= ? ORDER BY order_date DESC',
        [startDate, endDate],
      );
      return mapDatabaseRows<Order>(rows);
    } catch (error) {
      handleDatabaseError(error);
    }
  }
}

// Factory function to create repository instance
export async function createOrdersRepository(isTest: boolean = false): Promise<OrdersRepository> {
  const db = await getDatabase(isTest);
  return new OrdersRepository(db);
}

// Singleton instance for default usage
let ordersRepo: OrdersRepository | null = null;

export async function getOrdersRepository(isTest: boolean = false): Promise<OrdersRepository> {
  const isTestEnv = isTest || process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
  if (isTestEnv) {
    return createOrdersRepository(true);
  }
  if (!ordersRepo) {
    ordersRepo = await createOrdersRepository(false);
  }
  return ordersRepo;
}
