const rawBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;
const UPLOAD_REQUEST_TIMEOUT_MS = 20000;

function normalizeBaseUrl(value) {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/api/v1')) {
    return trimmed;
  }
  return `${trimmed}/api/v1`;
}

const API_BASE_URL = normalizeBaseUrl(rawBaseUrl);

function timeoutErrorMessage(timeoutMs) {
  const seconds = Math.max(1, Math.round(timeoutMs / 1000));
  return `Backend request timed out after ${seconds}s. Ensure backend is running and reachable.`;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(timeoutErrorMessage(timeoutMs));
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function request(path, options = {}) {
  let response;

  try {
    response = await fetchWithTimeout(
      `${API_BASE_URL}${path}`,
      {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        }
      },
      DEFAULT_REQUEST_TIMEOUT_MS
    );
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Unable to connect to backend service.');
  }

  if (!response.ok) {
    let detail = `Request failed with status ${response.status}`;

    try {
      const payload = await response.json();
      if (payload?.detail) {
        detail = payload.detail;
      }
    } catch {
      // Ignore JSON parse errors and keep the fallback message.
    }

    throw new Error(detail);
  }

  return response.json();
}

export async function listIntelligenceProducts({ action, category, jobId } = {}) {
  const params = new URLSearchParams();
  if (action) {
    params.set('action', action);
  }
  if (category) {
    params.set('category', category);
  }
  if (jobId) {
    params.set('job_id', jobId);
  }

  const query = params.toString();
  return request(`/intelligence/products${query ? `?${query}` : ''}`);
}

export async function listTrendSignals() {
  return request('/intelligence/trends');
}

export async function listTrendKeywords(category, limit = 12) {
  const params = new URLSearchParams();
  params.set('category', category);
  params.set('limit', String(limit));
  return request(`/intelligence/trends/keywords?${params.toString()}`);
}

export async function getTrendTimeline(category, months = 12) {
  const params = new URLSearchParams();
  params.set('category', category);
  params.set('months', String(months));
  return request(`/intelligence/trends/timeline?${params.toString()}`);
}

export async function queryCopilot(query) {
  return request('/copilot/query', {
    method: 'POST',
    body: JSON.stringify({ query })
  });
}

export async function listCatalogJobs(limit = 25) {
  return request(`/catalogs/jobs?limit=${limit}`);
}

export async function getCatalogJobStatus(jobId) {
  return request(`/catalogs/status/${encodeURIComponent(jobId)}`);
}

export async function cancelCatalogJob(jobId) {
  return request(`/catalogs/cancel/${encodeURIComponent(jobId)}`, {
    method: 'POST'
  });
}

export async function deleteCatalogJob(jobId) {
  const encodedJobId = encodeURIComponent(jobId);

  try {
    return await request(`/catalogs/delete/${encodedJobId}`, {
      method: 'DELETE'
    });
  } catch (primaryError) {
    const message = String(primaryError?.message || '');
    const shouldTryLegacyDeleteRoute = message === 'Not Found' || message.includes('status 405');

    if (!shouldTryLegacyDeleteRoute) {
      throw primaryError;
    }

    return request(`/catalogs/${encodedJobId}`, {
      method: 'DELETE'
    });
  }
}

export async function uploadCatalog(file) {
  const formData = new FormData();
  formData.append('file', file);

  let response;

  try {
    response = await fetchWithTimeout(
      `${API_BASE_URL}/catalogs/upload`,
      {
        method: 'POST',
        body: formData
      },
      UPLOAD_REQUEST_TIMEOUT_MS
    );
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Unable to upload file. Backend service is unreachable.');
  }

  if (!response.ok) {
    let detail = `Upload failed with status ${response.status}`;

    try {
      const payload = await response.json();
      if (payload?.detail) {
        detail = payload.detail;
      }
    } catch {
      // Ignore JSON parse errors and keep the fallback message.
    }

    throw new Error(detail);
  }

  return response.json();
}
