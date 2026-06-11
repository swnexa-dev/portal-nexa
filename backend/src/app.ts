import express from 'express'
import cors from 'cors'
import { authRoutes } from './routes/authRoutes.js'
import { billingRoutes, stripeWebhookHandler } from './routes/billingRoutes.js'
import { systemRoutes } from './routes/systemRoutes.js'
import { env } from './config/env.js'

export function createApp() {
  const app = express()

  app.use(
    cors({
      origin: env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()) ?? [env.FRONTEND_URL],
      credentials: true,
    })
  )

  app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), (request, response) => {
    return stripeWebhookHandler(request as typeof request & { body: Buffer }, response)
  })

  app.use(express.json())

  app.get('/', (_request, response) => {
    response.status(200).send('API Nexa online')
  })

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true, service: 'nexa-systems-api' })
  })

  app.use('/api/auth', authRoutes)
  app.use('/api/billing', billingRoutes)
  app.use('/api/systems', systemRoutes)

  return app
}
