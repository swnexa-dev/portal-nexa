import type { AuthResponse, AuthUser, BillingSummary, CatalogSystem, LegalVersions } from '../types'

function normalizeApiUrl(rawUrl: string) {
  const trimmed = rawUrl.trim().replace(/\/$/, '')
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`
}

const apiUrl = normalizeApiUrl(import.meta.env.VITE_API_URL ?? 'http://localhost:3000')

async function readJson<T>(response: Response) {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    return { message: response.ok ? 'Resposta inesperada da API' : 'Endpoint indisponível na API' } as T
  }

  return (await response.json()) as T
}

type ApiError = {
  message: string
}

function getErrorMessage(data: unknown, fallback: string) {
  if (Array.isArray(data) && data.length > 0) {
    const firstItem = data[0]
    if (
      typeof firstItem === 'object' &&
      firstItem &&
      'path' in firstItem &&
      Array.isArray((firstItem as { path?: unknown }).path) &&
      (firstItem as { path: unknown[] }).path.includes('email')
    ) {
      return 'Digite um e-mail válido, por exemplo: nome@empresa.com'
    }
  }
  if (typeof data === 'object' && data && 'message' in data && typeof (data as { message?: unknown }).message === 'string') {
    const message = (data as { message: string }).message
    if (message.toLowerCase().includes('email invalido') || message.toLowerCase().includes('email inválido')) {
      return 'Digite um e-mail válido, por exemplo: nome@empresa.com'
    }
    return message
  }
  return fallback
}

export async function register(payload: {
  name: string
  email: string
  phone: string
  document: string
  password: string
  passwordConfirm: string
  verificationCode: string
}) {
  const response = await fetch(`${apiUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await readJson<AuthResponse | ApiError>(response)
  if (!response.ok) {
    throw new Error(getErrorMessage(data, 'Falha ao cadastrar'))
  }
  return data as AuthResponse
}

export async function requestRegisterCode(payload: { name: string; email: string }) {
  const response = await fetch(`${apiUrl}/auth/register/request-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await readJson<{ email: string; expiresAt: string } | ApiError>(response)
  if (!response.ok) {
    throw new Error(getErrorMessage(data, 'Falha ao enviar código'))
  }
  return data as { email: string; expiresAt: string }
}

export async function verifyRegisterCode(payload: { email: string; code: string }) {
  const response = await fetch(`${apiUrl}/auth/register/verify-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await readJson<{ verified: boolean } | ApiError>(response)
  if (!response.ok) {
    throw new Error(getErrorMessage(data, 'Falha ao validar código'))
  }
  return data as { verified: boolean }
}

export async function login(payload: { email: string; password: string }) {
  const response = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await readJson<AuthResponse | ApiError>(response)
  if (!response.ok) {
    throw new Error(getErrorMessage(data, 'Falha ao entrar'))
  }
  return data as AuthResponse
}

export async function requestPasswordResetCode(payload: { email: string }) {
  const response = await fetch(`${apiUrl}/auth/password-reset/request-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await readJson<{ email: string; expiresAt: string } | ApiError>(response)
  if (!response.ok) {
    throw new Error(getErrorMessage(data, 'Falha ao enviar código de redefinição'))
  }
  return data as { email: string; expiresAt: string }
}

export async function verifyPasswordResetCode(payload: { email: string; code: string }) {
  const response = await fetch(`${apiUrl}/auth/password-reset/verify-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await readJson<{ verified: boolean } | ApiError>(response)
  if (!response.ok) {
    throw new Error(getErrorMessage(data, 'Falha ao validar código'))
  }
  return data as { verified: boolean }
}

export async function confirmPasswordReset(payload: {
  email: string
  code: string
  password: string
  passwordConfirm: string
}) {
  const response = await fetch(`${apiUrl}/auth/password-reset/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await readJson<{ success: boolean; message: string } | ApiError>(response)
  if (!response.ok) {
    throw new Error(getErrorMessage(data, 'Falha ao redefinir senha'))
  }
  return data as { success: boolean; message: string }
}

export async function fetchMe(accessToken: string) {
  const response = await fetch(`${apiUrl}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  const data = await readJson<{ user: AuthUser; meta: { remainingTrialDays: number } } | ApiError>(response)
  if (!response.ok) {
    throw new Error(getErrorMessage(data, 'Sessão inválida'))
  }
  return data as { user: AuthUser; meta: { remainingTrialDays: number } }
}

export async function fetchCatalog(accessToken: string) {
  const response = await fetch(`${apiUrl}/systems/catalog`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  const data = await readJson<{ systems: CatalogSystem[]; meta: { remainingTrialDays: number; trialActive: boolean } } | ApiError>(response)
  if (!response.ok) {
    throw new Error(getErrorMessage(data, 'Falha ao carregar sistemas'))
  }
  return data as { systems: CatalogSystem[]; meta: { remainingTrialDays: number; trialActive: boolean } }
}

export async function launchSystem(accessToken: string, systemSlug: string) {
  const response = await fetch(`${apiUrl}/systems/${systemSlug}/launch`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  const data = await readJson<{ accessToken: string; launchUrl: string } | ApiError>(response)
  if (!response.ok) {
    throw new Error(getErrorMessage(data, 'Falha ao abrir sistema'))
  }
  return data as { accessToken: string; launchUrl: string }
}

export async function fetchBillingSummary(accessToken: string) {
  const response = await fetch(`${apiUrl}/billing/summary`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  const data = await readJson<BillingSummary | ApiError>(response)
  if (!response.ok) {
    throw new Error(getErrorMessage(data, 'Falha ao carregar assinatura'))
  }
  return data as BillingSummary
}

export async function createBillingCheckout(accessToken: string) {
  const response = await fetch(`${apiUrl}/billing/checkout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  const data = await readJson<{ url: string } | ApiError>(response)
  if (!response.ok) {
    throw new Error(getErrorMessage(data, 'Falha ao iniciar checkout'))
  }
  return data as { url: string }
}

export async function createBillingPortal(accessToken: string) {
  const response = await fetch(`${apiUrl}/billing/portal`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  const data = await readJson<{ url: string } | ApiError>(response)
  if (!response.ok) {
    throw new Error(getErrorMessage(data, 'Falha ao abrir portal de cobrança'))
  }
  return data as { url: string }
}

export async function acceptLegalDocuments(accessToken: string) {
  const response = await fetch(`${apiUrl}/legal/accept`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  const data = await readJson<{ success: boolean; user: AuthUser } | ApiError>(response)
  if (!response.ok) {
    throw new Error(getErrorMessage(data, 'Falha ao registrar aceite dos termos'))
  }
  return data as { success: boolean; user: AuthUser }
}

export async function fetchLegalVersions() {
  const response = await fetch(`${apiUrl}/legal/versions`)
  const data = await readJson<LegalVersions | ApiError>(response)
  if (!response.ok) {
    throw new Error(getErrorMessage(data, 'Falha ao carregar versões legais'))
  }
  return data as LegalVersions
}
