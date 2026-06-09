import type { AuthResponse, AuthUser, CatalogSystem } from '../types'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'

async function readJson<T>(response: Response) {
  return (await response.json()) as T
}

type ApiError = {
  message: string
}

function getErrorMessage(data: unknown, fallback: string) {
  if (typeof data === 'object' && data && 'message' in data && typeof (data as { message?: unknown }).message === 'string') {
    return (data as { message: string }).message
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
    throw new Error(getErrorMessage(data, 'Falha ao enviar codigo'))
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
    throw new Error(getErrorMessage(data, 'Falha ao validar codigo'))
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

export async function fetchMe(accessToken: string) {
  const response = await fetch(`${apiUrl}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  const data = await readJson<{ user: AuthUser; meta: { remainingTrialDays: number } } | ApiError>(response)
  if (!response.ok) {
    throw new Error(getErrorMessage(data, 'Sessao invalida'))
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
