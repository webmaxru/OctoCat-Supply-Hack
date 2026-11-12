/**
 * @swagger
 * tags:
 *   name: Orders
 *   description: API endpoints for managing orders
 */

/**
 * @swagger
 * /api/orders:
 *   get:
 *     summary: Returns all orders, or paginated order history for a branch
 *     tags: [Orders]
 *     parameters:
 *       - in: query
 *         name: branchId
 *         description: Branch placing the orders. When supplied, returns history with line items and totals, newest first.
 *         schema:
 *           type: integer
 *           minimum: 1
 *       - in: query
 *         name: limit
 *         description: Maximum number of orders per history page. Requires branchId.
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *       - in: query
 *         name: offset
 *         description: Number of orders to skip. Requires branchId.
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *     responses:
 *       200:
 *         description: Orders, or branch order history. Empty history returns an empty array.
 *         content:
 *           application/json:
 *             schema:
 *               anyOf:
 *                 - type: array
 *                   items:
 *                     $ref: '#/components/schemas/Order'
 *                 - type: array
 *                   items:
 *                     $ref: '#/components/schemas/OrderHistory'
 *       400:
 *         description: Invalid branchId, limit, or offset, or pagination without branchId
 *   post:
 *     summary: Create a new order
 *     tags: [Orders]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Order'
 *     responses:
 *       201:
 *         description: Order created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Order'
 *
 * /api/orders/{id}:
 *   get:
 *     summary: Get an order by ID
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Order ID
 *     responses:
 *       200:
 *         description: Order found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Order'
 *       404:
 *         description: Order not found
 *   put:
 *     summary: Update an order
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Order ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Order'
 *     responses:
 *       200:
 *         description: Order updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Order'
 *       404:
 *         description: Order not found
 *   delete:
 *     summary: Delete an order
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Order ID
 *     responses:
 *       204:
 *         description: Order deleted successfully
 *       404:
 *         description: Order not found
 */

import express from 'express';
import { Order } from '../models/order';
import { getOrdersRepository } from '../repositories/ordersRepo';
import { NotFoundError, ValidationError } from '../utils/errors';

const router = express.Router();

function parseHistoryInteger(value: unknown, name: string, minimum: number, maximum: number = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new ValidationError(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new ValidationError(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

// Create a new order
router.post('/', async (req, res, next) => {
  try {
    const repo = await getOrdersRepository();
    const newOrder = await repo.create(req.body as Omit<Order, 'orderId'>);
    res.status(201).json(newOrder);
  } catch (error) {
    next(error);
  }
});

// Get all orders
router.get('/', async (req, res, next) => {
  try {
    if (req.query.branchId !== undefined) {
      const branchId = parseHistoryInteger(req.query.branchId, 'branchId', 1);
      const limit = req.query.limit === undefined ? 50 : parseHistoryInteger(req.query.limit, 'limit', 1, 100);
      const offset = req.query.offset === undefined ? 0 : parseHistoryInteger(req.query.offset, 'offset', 0);
      const repo = await getOrdersRepository();
      res.json(await repo.findHistoryByBranchId(branchId, limit, offset));
      return;
    }
    if (req.query.limit !== undefined || req.query.offset !== undefined) {
      throw new ValidationError('branchId is required for history pagination');
    }
    const repo = await getOrdersRepository();
    const orders = await repo.findAll();

    // Non-linear pattern example: duplicate destructuring in object
    if (orders.length > 0) {
      const { orderId: id, orderId: duplicateId } = orders[0];
      console.log('Non-linear pattern in order routes:', id, duplicateId);
    }

    res.json(orders);
  } catch (error) {
    next(error);
  }
});

// Get an order by ID
router.get('/:id', async (req, res, next) => {
  try {
    const repo = await getOrdersRepository();
    const order = await repo.findById(parseInt(req.params.id));
    if (order) {
      res.json(order);
    } else {
      res.status(404).send('Order not found');
    }
  } catch (error) {
    next(error);
  }
});

// Update an order by ID
router.put('/:id', async (req, res, next) => {
  try {
    const repo = await getOrdersRepository();
    const updatedOrder = await repo.update(parseInt(req.params.id), req.body);
    res.json(updatedOrder);
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).send('Order not found');
    } else {
      next(error);
    }
  }
});

// Delete an order by ID
router.delete('/:id', async (req, res, next) => {
  try {
    const repo = await getOrdersRepository();
    await repo.delete(parseInt(req.params.id));
    res.status(204).send();
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).send('Order not found');
    } else {
      next(error);
    }
  }
});

export default router;
