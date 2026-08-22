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
  changePassword: (currentPassword, newPassword) =>
    request('/api/auth/me/password', { method: 'PATCH', body: { currentPassword, newPassword } }),
  updateScratchpad: (scratchpad) => request('/api/auth/me/scratchpad', { method: 'PATCH', body: { scratchpad } }),

  users: {
    list: () => request('/api/users'),
    create: (body) => request('/api/users', { method: 'POST', body }),
    update: (id, body) => request(`/api/users/${id}`, { method: 'PATCH', body }),
  },

  companies: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/api/companies${qs ? `?${qs}` : ''}`);
    },
    get: (id) => request(`/api/companies/${id}`),
    create: (body) => request('/api/companies', { method: 'POST', body }),
    update: (id, body) => request(`/api/companies/${id}`, { method: 'PUT', body }),
    archive: (id) => request(`/api/companies/${id}/archive`, { method: 'PATCH' }),
    restore: (id) => request(`/api/companies/${id}/restore`, { method: 'PATCH' }),
    remove: (id) => request(`/api/companies/${id}`, { method: 'DELETE' }),
  },

  contacts: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/api/contacts${qs ? `?${qs}` : ''}`);
    },
    get: (id) => request(`/api/contacts/${id}`),
    create: (body) => request('/api/contacts', { method: 'POST', body }),
    update: (id, body) => request(`/api/contacts/${id}`, { method: 'PUT', body }),
    archive: (id) => request(`/api/contacts/${id}/archive`, { method: 'PATCH' }),
    restore: (id) => request(`/api/contacts/${id}/restore`, { method: 'PATCH' }),
    remove: (id) => request(`/api/contacts/${id}`, { method: 'DELETE' }),
  },

  deals: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/api/deals${qs ? `?${qs}` : ''}`);
    },
    get: (id) => request(`/api/deals/${id}`),
    conflicts: (companyId) => request(`/api/deals/conflicts?companyId=${companyId}`),
    create: (body) => request('/api/deals', { method: 'POST', body }),
    update: (id, body) => request(`/api/deals/${id}`, { method: 'PUT', body }),
    setStage: (id, stage, reason) => request(`/api/deals/${id}/stage`, { method: 'PATCH', body: { stage, reason } }),
    archive: (id) => request(`/api/deals/${id}/archive`, { method: 'PATCH' }),
    restore: (id) => request(`/api/deals/${id}/restore`, { method: 'PATCH' }),
    remove: (id) => request(`/api/deals/${id}`, { method: 'DELETE' }),
  },

  leads: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/api/leads${qs ? `?${qs}` : ''}`);
    },
    get: (id) => request(`/api/leads/${id}`),
    create: (body) => request('/api/leads', { method: 'POST', body }),
    update: (id, body) => request(`/api/leads/${id}`, { method: 'PUT', body }),
    setStage: (id, stage) => request(`/api/leads/${id}/stage`, { method: 'PATCH', body: { stage } }),
    archive: (id) => request(`/api/leads/${id}/archive`, { method: 'PATCH' }),
    restore: (id) => request(`/api/leads/${id}/restore`, { method: 'PATCH' }),
    remove: (id) => request(`/api/leads/${id}`, { method: 'DELETE' }),
    convert: (id, body = {}) => request(`/api/leads/${id}/convert`, { method: 'POST', body }),
    quickParse: (body) => request('/api/leads/quick-parse', { method: 'POST', body }),
  },

  projects: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/api/projects${qs ? `?${qs}` : ''}`);
    },
    get: (id) => request(`/api/projects/${id}`),
    create: (body) => request('/api/projects', { method: 'POST', body }),
    update: (id, body) => request(`/api/projects/${id}`, { method: 'PUT', body }),
    updateScratchpad: (id, scratchpad) => request(`/api/projects/${id}/scratchpad`, { method: 'PATCH', body: { scratchpad } }),
    archive: (id) => request(`/api/projects/${id}/archive`, { method: 'PATCH' }),
    restore: (id) => request(`/api/projects/${id}/restore`, { method: 'PATCH' }),
  },

  tasks: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/api/tasks${qs ? `?${qs}` : ''}`);
    },
    get: (id) => request(`/api/tasks/${id}`),
    create: (body) => request('/api/tasks', { method: 'POST', body }),
    update: (id, body) => request(`/api/tasks/${id}`, { method: 'PUT', body }),
    setStatus: (id, status) => request(`/api/tasks/${id}/status`, { method: 'PATCH', body: { status } }),
    claim: (id) => request(`/api/tasks/${id}/claim`, { method: 'PATCH' }),
    remove: (id) => request(`/api/tasks/${id}`, { method: 'DELETE' }),
    addSubtask: (id, title) => request(`/api/tasks/${id}/subtasks`, { method: 'POST', body: { title } }),
    updateSubtask: (id, subtaskId, body) => request(`/api/tasks/${id}/subtasks/${subtaskId}`, { method: 'PATCH', body }),
    removeSubtask: (id, subtaskId) => request(`/api/tasks/${id}/subtasks/${subtaskId}`, { method: 'DELETE' }),
    addSnippet: (id, body) => request(`/api/tasks/${id}/snippets`, { method: 'POST', body }),
    removeSnippet: (id, snippetId) => request(`/api/tasks/${id}/snippets/${snippetId}`, { method: 'DELETE' }),
  },

  activities: {
    list: (params) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/api/activities?${qs}`);
    },
    create: (body) => request('/api/activities', { method: 'POST', body }),
  },

  attachments: {
    list: (entityType, entityId) => request(`/api/attachments?entityType=${entityType}&entityId=${entityId}`),
    upload: async (entityType, entityId, file) => {
      const formData = new FormData();
      formData.append('entityType', entityType);
      formData.append('entityId', entityId);
      formData.append('file', file);
      const headers = {};
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/api/attachments`, { method: 'POST', headers, body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed with status ${res.status}`);
      return data;
    },
    download: async (id, filename) => {
      const headers = {};
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/api/attachments/${id}/download`, { headers });
      if (!res.ok) throw new Error(`Download failed with status ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },
    remove: (id) => request(`/api/attachments/${id}`, { method: 'DELETE' }),
  },

  rules: {
    list: () => request('/api/rules'),
    create: (body) => request('/api/rules', { method: 'POST', body }),
    update: (id, body) => request(`/api/rules/${id}`, { method: 'PATCH', body }),
    remove: (id) => request(`/api/rules/${id}`, { method: 'DELETE' }),
  },

  chat: {
    directory: () => request('/api/chat/directory'),
    channels: () => request('/api/chat/channels'),
    createChannel: (body) => request('/api/chat/channels', { method: 'POST', body }),
    openDirect: (memberIds) => request('/api/chat/channels/direct', { method: 'POST', body: { memberIds } }),
    messages: (channelId, params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/api/chat/channels/${channelId}/messages${qs ? `?${qs}` : ''}`);
    },
  },

  boards: {
    list: () => request('/api/boards'),
    get: (id) => request(`/api/boards/${id}`),
    create: (body) => request('/api/boards', { method: 'POST', body }),
    update: (id, body) => request(`/api/boards/${id}`, { method: 'PATCH', body }),
  },

  dashboard: () => request('/api/dashboard'),

  search: (q) => request(`/api/search?q=${encodeURIComponent(q)}`),

  notifications: {
    list: () => request('/api/notifications'),
    markRead: (id) => request(`/api/notifications/${id}/read`, { method: 'PATCH' }),
    markAllRead: () => request('/api/notifications/read-all', { method: 'PATCH' }),
  },
};
