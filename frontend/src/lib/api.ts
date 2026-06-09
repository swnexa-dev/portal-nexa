import type { AuthResponse, AuthUser, CatalogSystem } from '../types'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'

async function readJson<T>(response: Response) {
  return (await response.json()) as T
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

  const data = await readJson<AuthResponse | { message: string }>(response)
  if (!response.ok) {
    throw new Error('message' in data ? data.message : 'Falha ao cadastrar')
  }
  return data
}

export async function requestRegisterCode(payload: { name: string; email: string }) {
  const response = await fetch(`${apiUrl}/auth/register/request-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await readJson<{ message: string; email: string; expiresAt: string } | { message: string }>(response)
  if (!response.ok) {
    throw new Error('message' in data ? data.message : 'Falha ao enviar codigo')
  }
  return data
}

export async function verifyRegisterCode(payload: { email: string; code: string }) {
  const response = await fetch(`${apiUrl}/auth/register/verify-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await readJson<{ verified: boolean } | { message: string }>(response)
  if (!response.ok) {
    throw new Error('message' in data ? data.message : 'Falha ao validar codigo')
  }
  return data
}

export async function login(payload: { email: string; password: string }) {
  const response = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await readJson<AuthResponse | { message: string }>(response)
  if (!response.ok) {
    throw new Error('message' in data ? data.message : 'Falha ao entrar')
  }
  return data
}

export async function fetchMe(accessToken: string) {
  const response = await fetch(`${apiUrl}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  const data = await readJson<{ user: AuthUser; meta: { remainingTrialDays: number } } | { message: string }>(response)
  if (!response.ok) {
    throw new Error('message' in data ? data.message : 'Sessao invalida')
  }
  return data
}

export async function fetchCatalog(accessToken: string) {
  const response = await fetch(`${apiUrl}/systems/catalog`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  const data = await readJson<{ systems: CatalogSystem[]; meta: { remainingTrialDays: number; trialActive: boolean } } | { message: string }>(response)
  if (!response.ok) {
    throw new Error('message' in data ? data.message : 'Falha ao carregar sistemas')
  }
  return data
}

export async function launchSystem(accessToken: string, systemSlug: string) {
  const response = await fetch(`${apiUrl}/systems/${systemSlug}/launch`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  const data = await readJson<{ accessToken: string; launchUrl: string } | { message: string }>(response)
  if (!response.ok) {
    throw new Error('message' in data ? data.message : 'Falha ao abrir sistema')
  }
  return data
}
