const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';
const TOKEN_KEY = 'dominare_crm_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data;
}

export const api = {
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  me: () => request('/api/auth/me'),

  users: {
    list: () => request('/api/users'),
    create: (body) => request('/api/users', { method: 'POST', body }),
    update: (id, body) => request(`/api/users/${id}`, { method: 'PATCH', body }),
  },

  companies: {
    list: () => request('/api/companies'),
    get: (id) => request(`/api/companies/${id}`),
    create: (body) => request('/api/companies', { method: 'POST', body }),
    update: (id, body) => request(`/api/companies/${id}`, { method: 'PUT', body }),
    remove: (id) => request(`/api/companies/${id}`, { method: 'DELETE' }),
  },

  contacts: {
    list: (companyId) => request(`/api/contacts${companyId ? `?companyId=${companyId}` : ''}`),
    get: (id) => request(`/api/contacts/${id}`),
    create: (body) => request('/api/contacts', { method: 'POST', body }),
    update: (id, body) => request(`/api/contacts/${id}`, { method: 'PUT', body }),
    remove: (id) => request(`/api/contacts/${id}`, { method: 'DELETE' }),
  },

  deals: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/api/deals${qs ? `?${qs}` : ''}`);
    },
    get: (id) => request(`/api/deals/${id}`),
    create: (body) => request('/api/deals', { method: 'POST', body }),
    update: (id, body) => request(`/api/deals/${id}`, { method: 'PUT', body }),
    setStage: (id, stage) => request(`/api/deals/${id}/stage`, { method: 'PATCH', body: { stage } }),
    remove: (id) => request(`/api/deals/${id}`, { method: 'DELETE' }),
  },

  tasks: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/api/tasks${qs ? `?${qs}` : ''}`);
    },
    create: (body) => request('/api/tasks', { method: 'POST', body }),
    update: (id, body) => request(`/api/tasks/${id}`, { method: 'PUT', body }),
    setStatus: (id, status) => request(`/api/tasks/${id}/status`, { method: 'PATCH', body: { status } }),
    remove: (id) => request(`/api/tasks/${id}`, { method: 'DELETE' }),
  },

  activities: {
    list: (params) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/api/activities?${qs}`);
    },
    create: (body) => request('/api/activities', { method: 'POST', body }),
  },

  dashboard: () => request('/api/dashboard'),
};
