import type { NextFunction, Request, Response } from 'express'
import { verifyToken } from '../utils/jwt.js'

export function requireAuth(request: Request, response: Response, next: NextFunction) {
  const header = request.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    return response.status(401).json({ message: 'Token ausente' })
  }

  try {
    const payload = verifyToken(token)
    if (payload.type !== 'portal') {
      return response.status(401).json({ message: 'Token inválido para o portal' })
    }
    request.auth = payload
    next()
  } catch {
    return response.status(401).json({ message: 'Token inválido ou expirado' })
  }
}
