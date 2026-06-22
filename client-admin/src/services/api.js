const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const API_KEY = 'nursecall_api_key_dev';

async function request(method, path, body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
  };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(`${API_BASE}/api/v1${path}`, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || `HTTP ${response.status}`);
  }
  return data;
}

export const api = {
  // Dashboard
  getStats: () => request('GET', '/dashboard/stats'),
  getStatus: () => request('GET', '/dashboard/status'),
  getHourly: () => request('GET', '/dashboard/hourly'),

  // Users
  getUsers: (params = '') => request('GET', `/users?${params}`),
  getUser: (id) => request('GET', `/users/${id}`),
  createUser: (data) => request('POST', '/users', data),
  updateUser: (id, data) => request('PUT', `/users/${id}`, data),

  // Calls
  getCalls: (params = '') => request('GET', `/calls?${params}`),
  getCall: (id) => request('GET', `/calls/${id}`),
  getCallLogs: (id) => request('GET', `/calls/${id}/logs`),

  // Notifications
  getNotifications: (params = '') => request('GET', `/notifications?${params}`),
  markRead: (id) => request('PUT', `/notifications/${id}/read`),

  // Devices
  getDevices: (params = '') => request('GET', `/devices?${params}`),

  // Health
  getHealth: () => request('GET', '/health'),
};
