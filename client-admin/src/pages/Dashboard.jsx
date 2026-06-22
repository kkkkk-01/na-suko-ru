import React, { useEffect, useState } from 'react';
import { api } from '../services/api';

function StatCard({ label, value, sub, color = 'blue', icon }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
  };
  return (
    <div className={`p-5 rounded-xl border ${colors[color]} transition-shadow hover:shadow-md`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium opacity-80">{label}</span>
        <span className="text-2xl">{icon}</span>
      </div>
      <div className="text-3xl font-bold">{value}</div>
      {sub && <div className="text-xs mt-1 opacity-70">{sub}</div>}
    </div>
  );
}

function formatStatus(status) {
  const map = {
    ringing: { text: '呼出中', cls: 'bg-yellow-100 text-yellow-800' },
    answered: { text: '通話中', cls: 'bg-green-100 text-green-800' },
    ended: { text: '終了', cls: 'bg-gray-100 text-gray-700' },
    missed: { text: '不在', cls: 'bg-red-100 text-red-800' },
    failed: { text: '失敗', cls: 'bg-red-200 text-red-900' },
  };
  const s = map[status] || { text: status, cls: 'bg-gray-100' };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.text}</span>;
}

export default function Dashboard({ events }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = async () => {
    try {
      const data = await api.getStats();
      setStats(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000); // 10秒ごと更新
    return () => clearInterval(interval);
  }, []);

  // リアルタイムイベントでも更新
  useEffect(() => {
    if (events.length > 0) {
      fetchStats();
    }
  }, [events.length]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 text-lg">読み込み中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <p className="text-red-600 text-lg mb-2">接続エラー</p>
        <p className="text-red-400 text-sm">{error}</p>
        <button onClick={fetchStats} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">
          再試行
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">ダッシュボード</h2>
        <span className="text-sm text-gray-400">
          最終更新: {new Date().toLocaleTimeString('ja-JP')}
        </span>
      </div>

      {/* 統計カード */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <StatCard label="本日の通話" value={stats.today.total_calls} icon="📞" color="blue" />
        <StatCard label="応答済み" value={stats.today.answered_calls} icon="✅" color="green" />
        <StatCard label="不在着信" value={stats.today.missed_calls} icon="📵" color="red" />
        <StatCard label="平均応答(秒)" value={stats.today.avg_response_time} icon="⏱️" color="yellow" />
        <StatCard
          label="オンライン端末"
          value={`${stats.active_devices.online}/${stats.active_devices.total}`}
          icon="📱"
          color="purple"
        />
      </div>

      {/* 直近の通話 + リアルタイムイベント */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 直近の通話 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
            <span>📋</span> 直近の通話
          </h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {stats.recent_calls.length === 0 ? (
              <p className="text-gray-400 text-center py-8">通話履歴はありません</p>
            ) : (
              stats.recent_calls.map(call => (
                <div key={call.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                  <div>
                    <div className="font-medium text-gray-800 text-sm">
                      {call.caller?.name || '不明'}
                      <span className="text-gray-400 mx-1">→</span>
                      {call.callee?.name || '不明'}
                    </div>
                    <div className="text-xs text-gray-400">
                      {new Date(call.started_at).toLocaleString('ja-JP')}
                      {call.duration > 0 && ` (${call.duration}秒)`}
                    </div>
                  </div>
                  {formatStatus(call.status)}
                </div>
              ))
            )}
          </div>
        </div>

        {/* リアルタイムイベント */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
            <span>⚡</span> リアルタイムイベント
          </h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {events.length === 0 ? (
              <p className="text-gray-400 text-center py-8">イベントを待機中...</p>
            ) : (
              events.slice(0, 20).map((event, i) => (
                <div key={i} className="py-2 px-3 rounded-lg bg-gray-50 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-blue-600">{event.type}</span>
                    <span className="text-xs text-gray-400">
                      {new Date(event.timestamp).toLocaleTimeString('ja-JP')}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1 truncate">
                    {JSON.stringify(event.data).substring(0, 100)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
