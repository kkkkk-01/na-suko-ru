import React, { useEffect, useState } from 'react';
import { api } from '../services/api';

function ServiceStatus({ name, status, icon }) {
  const isHealthy = status === 'connected' || status === 'healthy' || status === 'active';
  return (
    <div className={`flex items-center justify-between p-4 rounded-xl border ${
      isHealthy ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
    }`}>
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <span className="font-medium text-gray-800">{name}</span>
      </div>
      <span className={`flex items-center gap-1.5 text-sm font-medium ${
        isHealthy ? 'text-green-700' : 'text-red-700'
      }`}>
        <span className={`w-2.5 h-2.5 rounded-full ${isHealthy ? 'bg-green-500' : 'bg-red-500'}`}></span>
        {status}
      </span>
    </div>
  );
}

export default function SystemStatus() {
  const [systemStatus, setSystemStatus] = useState(null);
  const [health, setHealth] = useState(null);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      const [statusData, healthData, devicesData] = await Promise.all([
        api.getStatus(),
        api.getHealth().catch(() => null),
        api.getDevices(),
      ]);
      setSystemStatus(statusData);
      setHealth(healthData);
      setDevices(devicesData.devices || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const formatUptime = (seconds) => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const parts = [];
    if (d > 0) parts.push(`${d}日`);
    if (h > 0) parts.push(`${h}時間`);
    if (m > 0) parts.push(`${m}分`);
    parts.push(`${s}秒`);
    return parts.join(' ');
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">読み込み中...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">システム状態</h2>
        <button
          onClick={fetchStatus}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
        >
          🔄 更新
        </button>
      </div>

      {/* サービスステータス */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <ServiceStatus
          name="APIサーバー"
          status={systemStatus?.api_server || 'unknown'}
          icon="🖥️"
        />
        <ServiceStatus
          name="データベース"
          status={systemStatus?.database || 'unknown'}
          icon="🗄️"
        />
        <ServiceStatus
          name="Asterisk"
          status={systemStatus?.asterisk || 'unknown'}
          icon="📡"
        />
      </div>

      {/* システム情報 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* サーバー情報 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h3 className="font-bold text-gray-700 mb-4">🖥️ サーバー情報</h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">稼働時間</span>
              <span className="font-mono text-gray-800">
                {systemStatus ? formatUptime(systemStatus.uptime_seconds) : '-'}
              </span>
            </div>
            {systemStatus?.memory_usage && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">RSS メモリ</span>
                  <span className="font-mono">{systemStatus.memory_usage.rss_mb} MB</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">ヒープ使用量</span>
                  <span className="font-mono">
                    {systemStatus.memory_usage.heap_used_mb} / {systemStatus.memory_usage.heap_total_mb} MB
                  </span>
                </div>
                {/* メモリ使用率バー */}
                <div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>ヒープ使用率</span>
                    <span>{Math.round(systemStatus.memory_usage.heap_used_mb / systemStatus.memory_usage.heap_total_mb * 100)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all"
                      style={{ width: `${Math.min(100, systemStatus.memory_usage.heap_used_mb / systemStatus.memory_usage.heap_total_mb * 100)}%` }}
                    ></div>
                  </div>
                </div>
              </>
            )}
            {health && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">WebSocket接続数</span>
                <span className="font-mono">{health.services?.websocket_clients || 0}</span>
              </div>
            )}
          </div>
        </div>

        {/* デバイス一覧 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h3 className="font-bold text-gray-700 mb-4">📱 デバイス一覧</h3>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {devices.length === 0 ? (
              <p className="text-gray-400 text-center py-8">登録デバイスなし</p>
            ) : (
              devices.map(device => (
                <div key={device.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50">
                  <div>
                    <div className="text-sm font-medium text-gray-800">
                      {device.user_name}
                      <span className="text-xs text-gray-400 ml-2">({device.user_role})</span>
                    </div>
                    <div className="text-xs text-gray-400">
                      {device.device_type} / {device.sip_username || 'SIP未設定'}
                    </div>
                  </div>
                  <span className={`flex items-center gap-1 text-xs font-medium ${
                    device.is_online ? 'text-green-600' : 'text-gray-400'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${device.is_online ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                    {device.is_online ? 'オンライン' : 'オフライン'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
