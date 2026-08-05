// Fetch wrapper.

const BASE_URL = '/api'

interface RequestOptions {
  method?: string
  body?: any
  headers?: Record<string, string>
}

async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {} } = options

  const token = localStorage.getItem('token')
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const config: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    credentials: 'include'
  }

  if (body && method !== 'GET') {
    if (body instanceof FormData) {
      delete headers['Content-Type']
      config.body = body
    } else {
      config.body = JSON.stringify(body)
    }
  }

  const response = await fetch(`${BASE_URL}${url}`, config)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  return response.json()
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body?: any) => request<T>(url, { method: 'POST', body }),
  put: <T>(url: string, body?: any) => request<T>(url, { method: 'PUT', body }),
  delete: <T>(url: string) => request<T>(url, { method: 'DELETE' }),
  upload: <T>(url: string, formData: FormData) => request<T>(url, { method: 'POST', body: formData })
}
