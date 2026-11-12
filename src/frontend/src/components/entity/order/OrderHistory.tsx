import { useState } from 'react';
import { useQuery } from 'react-query';
import { Link } from 'react-router-dom';
import { fetchBranches, fetchOrderHistory, historyPageSize } from '../../../api/orderHistory';
import type { OrderHistory as OrderHistoryData } from '../../../api/orderHistory';
import { useTheme } from '../../../context/ThemeContext';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function OrderReceipt({ order }: { order: OrderHistoryData }) {
  const { darkMode } = useTheme();
  return (
    <details className={`rounded-lg border-t-4 border-primary shadow-sm ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
      <summary className="cursor-pointer rounded-lg p-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
        <span className="ml-2 inline-grid w-11/12 grid-cols-2 items-center gap-3 sm:grid-cols-4">
          <span className="font-mono font-semibold">Order #{order.orderId}</span>
          <time dateTime={order.orderDate}>{new Date(order.orderDate).toLocaleDateString()}</time>
          <span className="capitalize">{order.status}</span>
          <span className="font-mono font-semibold sm:text-right">{currency.format(order.total)}</span>
        </span>
        <span className="mt-3 block text-sm underline">View line items</span>
      </summary>
      <div className={`border-t p-5 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <h2 className="mb-4 text-lg font-semibold">{order.name}</h2>
        {order.orderDetails.length === 0 ? (
          <p>No line items for this order.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Line items for order #{order.orderId}</caption>
              <thead>
                <tr>
                  <th scope="col" className="pb-3 pr-4">Product</th>
                  <th scope="col" className="pb-3 pr-4 text-right">Quantity</th>
                  <th scope="col" className="pb-3 text-right">Unit price</th>
                </tr>
              </thead>
              <tbody>
                {order.orderDetails.map((detail) => (
                  <tr key={detail.orderDetailId}>
                    <td className="py-2 pr-4">{detail.productName}</td>
                    <td className="py-2 pr-4 text-right font-mono">{detail.quantity}</td>
                    <td className="py-2 text-right font-mono">{currency.format(detail.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  );
}

function BranchHistory({ branchId }: { branchId: number }) {
  const [page, setPage] = useState(0);
  const { data: orders, isLoading, isError, refetch } = useQuery(
    ['order-history', branchId, page],
    () => fetchOrderHistory(branchId, page),
    { staleTime: 30_000, retry: false },
  );
  const buttonClass = 'rounded border border-primary px-4 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50';
  return (
    <section aria-label="Branch order history" aria-busy={isLoading} className="space-y-4">
      {isLoading && <p role="status">Loading order history...</p>}
      {isError ? (
        <div role="alert">
          <p>Could not load order history. Try again.</p>
          <button className={`${buttonClass} mt-3`} onClick={() => void refetch()}>Try again</button>
        </div>
      ) : orders && (
        <>
          {orders.length === 0 ? (
            <div role="status" className="py-10 text-center">
              <h2 className="text-xl font-semibold">{page === 0 ? 'No orders yet' : 'No more orders'}</h2>
              {page === 0 && (
                <p className="mt-2">Orders for this branch will appear here. <Link className="underline" to="/products">Browse products</Link></p>
              )}
            </div>
          ) : (
            <ul className="space-y-4">
              {orders.map((order) => <li key={order.orderId}><OrderReceipt order={order} /></li>)}
            </ul>
          )}
        </>
      )}
      <div className="flex items-center justify-between gap-4">
        <button className={buttonClass} disabled={page === 0 || isLoading} onClick={() => setPage(page - 1)}>Newer orders</button>
        <span className="text-sm">Page {page + 1}</span>
        <button className={buttonClass} disabled={isLoading || isError || orders?.length !== historyPageSize} onClick={() => setPage(page + 1)}>Older orders</button>
      </div>
    </section>
  );
}

export default function OrderHistory() {
  const { darkMode } = useTheme();
  const [branchId, setBranchId] = useState('');
  const { data: branches, isLoading, isError, refetch } = useQuery('branches', fetchBranches, { staleTime: 30_000, retry: false });
  return (
    <div className={`min-h-screen px-4 pb-16 pt-24 ${darkMode ? 'text-light' : 'text-gray-800'}`}>
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <h1 className="text-3xl font-bold">Order history</h1>
          <p className="mt-2">Review past purchases by branch. Open an order to see its line items.</p>
        </header>
        {isLoading && <p role="status">Loading branches...</p>}
        {isError ? (
          <div role="alert">
            <p>Could not load branches. Try again.</p>
            <button className="mt-2 rounded border border-primary px-4 py-2" onClick={() => void refetch()}>Try again</button>
          </div>
        ) : branches && (
          branches.length === 0 ? <p role="status">No branches available.</p> : (
            <>
              <div>
                <label className="block font-medium" htmlFor="history-branch">Branch</label>
                <select
                  id="history-branch"
                  value={branchId}
                  onChange={(event) => setBranchId(event.target.value)}
                  className={`mt-2 block w-full rounded-lg border p-3 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary sm:max-w-sm ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-300 bg-white'}`}
                >
                  <option value="">Select a branch</option>
                  {branches.map((branch) => <option key={branch.branchId} value={branch.branchId}>{branch.name}</option>)}
                </select>
              </div>
              {branchId ? <BranchHistory key={branchId} branchId={Number(branchId)} /> : <p role="status">Select a branch to view its orders.</p>}
            </>
          )
        )}
      </div>
    </div>
  );
}
