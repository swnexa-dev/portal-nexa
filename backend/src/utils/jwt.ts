import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

export type PortalTokenPayload = {
  sub: string
  email: string
  name?: string
  role: 'customer'
}

export type JwtPayload = PortalTokenPayload & {
  type: 'portal'
}

export type SsoJwtPayload = PortalTokenPayload & {
  type: 'system-access'
  systemSlug: string
}

export function signPortalToken(payload: PortalTokenPayload) {
  return jwt.sign({ ...payload, type: 'portal' } as JwtPayload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  })
}

export function signSystemAccessToken(payload: PortalTokenPayload & { systemSlug: string }) {
  return jwt.sign({ ...payload, type: 'system-access' } as SsoJwtPayload, env.JWT_SECRET, {
    expiresIn: env.SSO_JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  })
}

export function verifyToken(token: string) {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload | SsoJwtPayload
}
