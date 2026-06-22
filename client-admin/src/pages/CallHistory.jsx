import React, { useEffect, useState } from 'react';
import { api } from '../services/api';

function StatusBadge({ status }) {
  const map = {
    ringing: { text: '呼出中', cls: 'bg-yellow-100 text-yellow-800' },
    answered: { text: '応答', cls: 'bg-blue-100 text-blue-800' },
    ended: { text: '終了', cls: 'bg-gray-100 text-gray-700' },
    missed: { text: '不在', cls: 'bg-red-100 text-red-800' },
    failed: { text: '失敗', cls: 'bg-red-200 text-red-900' },
  };
  const s = map[status] || { text: status, cls: 'bg-gray-100' };
  return <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${s.cls}`}>{s.text}</span>;
}

export default function CallHistory() {
  const [calls, setCalls] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedCall, setSelectedCall] = useState(null);
  const [logs, setLogs] = useState([]);

  const perPage = 15;

  const fetchCalls = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, per_page: perPage });
      if (statusFilter) params.set('status', statusFilter);
      const data = await api.getCalls(params.toString());
      setCalls(data.calls);
      setTotal(data.total);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const fetchLogs = async (callId) => {
    try {
      const data = await api.getCallLogs(callId);
      setLogs(data.logs);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { fetchCalls(); }, [page, statusFilter]);

  const totalPages = Math.ceil(total / perPage);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">通話履歴</h2>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">すべて</option>
            <option value="ended">終了</option>
            <option value="missed">不在</option>
            <option value="answered">応答中</option>
            <option value="ringing">呼出中</option>
          </select>
          <span className="text-sm text-gray-500">全 {total} 件</span>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">ID</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">発信者</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">着信者</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">ステータス</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">開始日時</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">通話時間</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7" className="text-center py-12 text-gray-400">読み込み中...</td></tr>
            ) : calls.length === 0 ? (
              <tr><td colSpan="7" className="text-center py-12 text-gray-400">履歴がありません</td></tr>
            ) : (
              calls.map(call => (
                <tr key={call.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-500">#{call.id}</td>
                  <td className="px-4 py-3 text-sm">
                    <div className="font-medium text-gray-800">{call.caller?.name}</div>
                    <div className="text-xs text-gray-400">{call.caller?.room_number && `${call.caller.room_number}号室`}</div>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="font-medium text-gray-800">{call.callee?.name || '-'}</div>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={call.status} /></td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {new Date(call.started_at).toLocaleString('ja-JP')}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {call.duration > 0 ? `${Math.floor(call.duration / 60)}分${call.duration % 60}秒` : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => { setSelectedCall(call); fetchLogs(call.id); }}
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      詳細
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ページネーション */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-4">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-50 hover:bg-gray-50"
          >
            前へ
          </button>
          <span className="text-sm text-gray-600">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-50 hover:bg-gray-50"
          >
            次へ
          </button>
        </div>
      )}

      {/* 詳細モーダル */}
      {selectedCall && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSelectedCall(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">通話詳細 #{selectedCall.id}</h3>
              <button onClick={() => setSelectedCall(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="space-y-3 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">発信者</span>
                <span className="font-medium">{selectedCall.caller?.name} {selectedCall.caller?.room_number && `(${selectedCall.caller.room_number}号室)`}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">着信者</span>
                <span className="font-medium">{selectedCall.callee?.name || '-'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">ステータス</span>
                <StatusBadge status={selectedCall.status} />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">開始</span>
                <span>{new Date(selectedCall.started_at).toLocaleString('ja-JP')}</span>
              </div>
              {selectedCall.answered_at && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">応答</span>
                  <span>{new Date(selectedCall.answered_at).toLocaleString('ja-JP')}</span>
                </div>
              )}
              {selectedCall.ended_at && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">終了</span>
                  <span>{new Date(selectedCall.ended_at).toLocaleString('ja-JP')}</span>
                </div>
              )}
              {selectedCall.duration > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">通話時間</span>
                  <span className="font-mono">{Math.floor(selectedCall.duration / 60)}:{String(selectedCall.duration % 60).padStart(2, '0')}</span>
                </div>
              )}
            </div>

            {/* 通話ログ */}
            {logs.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-700 text-sm mb-2">イベントログ</h4>
                <div className="bg-gray-50 rounded-lg p-3 max-h-48 overflow-y-auto space-y-1">
                  {logs.map(log => (
                    <div key={log.id} className="text-xs flex items-center gap-2">
                      <span className="text-gray-400 font-mono">{new Date(log.created_at).toLocaleTimeString('ja-JP')}</span>
                      <span className="font-medium text-gray-600">{log.event_type}</span>
                      <span className="text-gray-400">{log.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
