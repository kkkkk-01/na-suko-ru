import React, { useEffect, useState } from 'react';
import { api } from '../services/api';

export default function NotificationHistory() {
  const [notifications, setNotifications] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const perPage = 20;

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, per_page: perPage });
      if (statusFilter) params.set('status', statusFilter);
      const data = await api.getNotifications(params.toString());
      setNotifications(data.notifications);
      setTotal(data.total);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchNotifications(); }, [page, statusFilter]);

  const statusMap = {
    pending: { text: '保留', cls: 'bg-gray-100 text-gray-700' },
    sent: { text: '送信済', cls: 'bg-blue-100 text-blue-700' },
    delivered: { text: '到達', cls: 'bg-green-100 text-green-700' },
    read: { text: '既読', cls: 'bg-green-200 text-green-800' },
    failed: { text: '失敗', cls: 'bg-red-100 text-red-700' },
  };

  const typeMap = {
    call_request: { text: '呼出', icon: '📞' },
    emergency: { text: '緊急', icon: '🚨' },
    system: { text: 'システム', icon: '⚙️' },
  };

  const totalPages = Math.ceil(total / perPage);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">通知履歴</h2>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">すべて</option>
            <option value="pending">保留</option>
            <option value="sent">送信済</option>
            <option value="delivered">到達</option>
            <option value="read">既読</option>
            <option value="failed">失敗</option>
          </select>
          <span className="text-sm text-gray-500">全 {total} 件</span>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">ID</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">種別</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">発信者</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">着信者</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">メッセージ</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">ステータス</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">日時</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7" className="text-center py-12 text-gray-400">読み込み中...</td></tr>
            ) : notifications.length === 0 ? (
              <tr><td colSpan="7" className="text-center py-12 text-gray-400">通知はありません</td></tr>
            ) : (
              notifications.map(notif => {
                const type = typeMap[notif.type] || { text: notif.type, icon: '📋' };
                const status = statusMap[notif.status] || { text: notif.status, cls: 'bg-gray-100' };
                return (
                  <tr key={notif.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-500">#{notif.id}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="flex items-center gap-1.5">
                        <span>{type.icon}</span>
                        <span>{type.text}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-800">
                      {notif.caller?.name}
                      {notif.caller?.room_number && (
                        <span className="text-xs text-gray-400 ml-1">({notif.caller.room_number}号室)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{notif.callee?.name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{notif.message}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${status.cls}`}>
                        {status.text}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(notif.created_at).toLocaleString('ja-JP')}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-4">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-50 hover:bg-gray-50"
          >
            前へ
          </button>
          <span className="text-sm text-gray-600">{page} / {totalPages}</span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-50 hover:bg-gray-50"
          >
            次へ
          </button>
        </div>
      )}
    </div>
  );
}
