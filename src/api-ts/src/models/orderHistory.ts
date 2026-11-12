import { Order } from './order';
import { OrderDetail } from './orderDetail';

/**
 * @swagger
 * components:
 *   schemas:
 *     OrderHistoryDetail:
 *       type: object
 *       required: [orderDetailId, orderId, productId, productName, quantity, unitPrice, notes]
 *       properties:
 *         orderDetailId:
 *           type: integer
 *         orderId:
 *           type: integer
 *         productId:
 *           type: integer
 *         productName:
 *           type: string
 *         quantity:
 *           type: integer
 *         unitPrice:
 *           type: number
 *         notes:
 *           type: string
 *           nullable: true
 *     OrderHistory:
 *       type: object
 *       required: [orderId, branchId, orderDate, name, description, status, total, orderDetails]
 *       properties:
 *         orderId:
 *           type: integer
 *         branchId:
 *           type: integer
 *         orderDate:
 *           type: string
 *           format: date-time
 *         name:
 *           type: string
 *         description:
 *           type: string
 *           nullable: true
 *         status:
 *           type: string
 *         total:
 *           type: number
 *           description: Sum of quantity times the stored unit price, rounded to two decimal places
 *         orderDetails:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/OrderHistoryDetail'
 */
export interface OrderHistoryDetail extends Omit<OrderDetail, 'notes'> {
  productName: string;
  notes: string | null;
}

export interface OrderHistory extends Omit<Order, 'description'> {
  description: string | null;
  total: number;
  orderDetails: OrderHistoryDetail[];
}
