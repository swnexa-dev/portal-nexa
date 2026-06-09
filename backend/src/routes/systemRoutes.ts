import { Router } from 'express'
import { env } from '../config/env.js'
import { getSystemBySlug, systemCatalog } from '../config/catalog.js'
import { requireAuth } from '../middleware/auth.js'
import { findUserById } from '../services/authService.js'
import { canAccessSystem, hasActiveSubscription, isTrialActive, remainingTrialDays } from '../utils/access.js'
import { signSystemAccessToken } from '../utils/jwt.js'

export const systemRoutes = Router()

systemRoutes.get('/catalog', requireAuth, async (request, response) => {
  const user = await findUserById(request.auth!.sub)

  if (!user) {
    return response.status(404).json({ message: 'Usuario nao encontrado' })
  }

  return response.json({
    systems: systemCatalog.map((system) => ({
      ...system,
      launchUrl: process.env[system.launchUrlEnv] ?? system.launchUrlFallback,
      access: {
        allowed: canAccessSystem(user, system.slug),
        viaTrial: isTrialActive(user),
        hasSubscription: hasActiveSubscription(user, system.slug),
      },
    })),
    meta: {
      remainingTrialDays: remainingTrialDays(user),
      trialActive: isTrialActive(user),
      redirectBaseUrl: env.FRONTEND_URL,
    },
  })
})

systemRoutes.post('/:systemSlug/launch', requireAuth, async (request, response) => {
  const system = getSystemBySlug(String(request.params.systemSlug))
  if (!system) {
    return response.status(404).json({ message: 'Sistema nao encontrado' })
  }

  const user = await findUserById(request.auth!.sub)
  if (!user) {
    return response.status(404).json({ message: 'Usuario nao encontrado' })
  }

  if (!canAccessSystem(user, system.slug)) {
    return response.status(403).json({ message: 'Acesso bloqueado para este sistema' })
  }

  const accessToken = signSystemAccessToken({
    sub: user._id.toString(),
    email: user.email,
    name: user.name,
    role: 'customer',
    systemSlug: system.slug,
  })

  const launchUrl = process.env[system.launchUrlEnv] ?? system.launchUrlFallback

  return response.json({
    systemSlug: system.slug,
    accessToken,
    launchUrl: `${launchUrl}?token=${encodeURIComponent(accessToken)}&email=${encodeURIComponent(user.email)}&name=${encodeURIComponent(user.name)}`,
  })
})
