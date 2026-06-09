import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

export type JwtPayload = {
  sub: string
  email: string
  name?: string
  role: 'customer'
  type: 'portal'
}

export type SsoJwtPayload = JwtPayload & {
  type: 'system-access'
  systemSlug: string
}

export function signPortalToken(payload: Omit<JwtPayload, 'type'>) {
  return jwt.sign({ ...payload, type: 'portal' }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN })
}

export function signSystemAccessToken(payload: Omit<SsoJwtPayload, 'type'>) {
  return jwt.sign({ ...payload, type: 'system-access' }, env.JWT_SECRET, { expiresIn: env.SSO_JWT_EXPIRES_IN })
}

export function verifyToken(token: string) {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload | SsoJwtPayload
}
