import axios from 'axios';
import { api } from './config';

export interface Branch {
  branchId: number;
  name: string;
}

export interface OrderHistory {
  orderId: number;
  branchId: number;
  orderDate: string;
  name: string;
  description: string | null;
  status: string;
  total: number;
  orderDetails: {
    orderDetailId: number;
    orderId: number;
    productId: number;
    productName: string;
    quantity: number;
    unitPrice: number;
    notes: string | null;
  }[];
}

export const historyPageSize = 20;

export async function fetchBranches(): Promise<Branch[]> {
  const { data } = await axios.get<Branch[]>(`${api.baseURL}${api.endpoints.branches}`);
  return data;
}

export async function fetchOrderHistory(branchId: number, page: number): Promise<OrderHistory[]> {
  const { data } = await axios.get<OrderHistory[]>(`${api.baseURL}${api.endpoints.orders}`, {
    params: { branchId, limit: historyPageSize, offset: page * historyPageSize },
  });
  return data;
}
