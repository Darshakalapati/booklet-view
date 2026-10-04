// Talks to the Python backend. Every screen goes through `api()`.

const TOKEN_KEY = 'booklet.token';

export const getToken = () => {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token) => {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private browsing: the session simply ends when the tab closes */
  }
};

// The backend answers errors in several shapes; turn any of them into one sentence.
function describe(problem) {
  if (problem == null) return '';
  if (typeof problem === 'string') return problem;
  if (Array.isArray(problem)) return problem.map(describe).filter(Boolean).join(' ');
  if (typeof problem === 'object') {
    if (typeof problem.detail === 'string') return problem.detail;
    return Object.values(problem).map(describe).filter(Boolean).join(' ');
  }
  return String(problem);
}

export class ApiError extends Error {
  constructor(status, data) {
    super(describe(data) || `The request failed (${status}).`);
    this.status = status;
    this.data = data;
  }
}

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Token ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(0, 'The server could not be reached. Check that it is running.');
  }

  if (response.status === 401 && token) {
    setToken(null);
    window.dispatchEvent(new Event('booklet:signed-out'));
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, data);
  return data;
}

// Deleting is two steps: ask what would be removed, then confirm.
export async function describeDelete(path) {
  try {
    await api(path, { method: 'DELETE' });
  } catch (error) {
    if (error.data?.confirm_required) return error.data.will_delete;
    throw error;
  }
  return null;
}

export const confirmDelete = (path) => api(`${path}?confirm=true`, { method: 'DELETE' });
