import React, { useState } from 'react';
import { useSocket } from './hooks/useSocket';
import Dashboard from './pages/Dashboard';
import CallHistory from './pages/CallHistory';
import NotificationHistory from './pages/NotificationHistory';
import SystemStatus from './pages/SystemStatus';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'ダッシュボード', icon: '📊' },
  { id: 'calls', label: '通話履歴', icon: '📞' },
  { id: 'notifications', label: '通知履歴', icon: '🔔' },
  { id: 'system', label: 'システム状態', icon: '⚙️' },
];

export default function App() {
  const [activePage, setActivePage] = useState('dashboard');
  const { connected, events } = useSocket();

  const unreadCount = events.filter(e =>
    e.type === 'notification:new' || e.type === 'call:incoming'
  ).length;

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard': return <Dashboard events={events} />;
      case 'calls': return <CallHistory />;
      case 'notifications': return <NotificationHistory />;
      case 'system': return <SystemStatus />;
      default: return <Dashboard events={events} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏥</span>
            <h1 className="text-xl font-bold text-gray-800">ナースコール管理</h1>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Phase1</span>
          </div>
          <div className="flex items-center gap-4">
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full animate-pulse">
                {unreadCount} 件の新着
              </span>
            )}
            <span className={`flex items-center gap-1.5 text-sm ${connected ? 'text-green-600' : 'text-red-500'}`}>
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></span>
              {connected ? '接続中' : '切断'}
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto flex">
        {/* サイドバー */}
        <nav className="w-56 bg-white shadow-sm min-h-[calc(100vh-57px)] border-r border-gray-200 pt-4">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setActivePage(item.id)}
              className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
                activePage === item.id
                  ? 'bg-blue-50 text-blue-700 border-r-3 border-blue-600 font-medium'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="text-sm">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* メインコンテンツ */}
        <main className="flex-1 p-6">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}
