import { Router, type Request, type Response } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { createCheckoutSession, createCustomerPortalSession, getBillingSummary, handleStripeWebhook, verifyStripeWebhookSignature } from '../services/billingService.js'

export const billingRoutes = Router()

billingRoutes.get('/summary', requireAuth, async (request, response) => {
  try {
    const userId = request.auth?.sub
    if (!userId) {
      return response.status(401).json({ message: 'Não autenticado' })
    }

    const summary = await getBillingSummary(userId)
    return response.json(summary)
  } catch (error) {
    return response.status(400).json({ message: error instanceof Error ? error.message : 'Falha ao carregar assinatura' })
  }
})

billingRoutes.post('/checkout', requireAuth, async (request, response) => {
  try {
    const userId = request.auth?.sub
    if (!userId) {
      return response.status(401).json({ message: 'Não autenticado' })
    }

    const session = await createCheckoutSession(userId)
    return response.status(201).json(session)
  } catch (error) {
    return response.status(400).json({ message: error instanceof Error ? error.message : 'Falha ao iniciar checkout' })
  }
})

billingRoutes.post('/portal', requireAuth, async (request, response) => {
  try {
    const userId = request.auth?.sub
    if (!userId) {
      return response.status(401).json({ message: 'Não autenticado' })
    }

    const session = await createCustomerPortalSession(userId)
    return response.status(201).json(session)
  } catch (error) {
    return response.status(400).json({ message: error instanceof Error ? error.message : 'Falha ao abrir portal de cobrança' })
  }
})

export async function stripeWebhookHandler(request: Request & { body: Buffer }, response: Response) {
  try {
    const signatureHeader = Array.isArray(request.headers['stripe-signature'])
      ? request.headers['stripe-signature'][0]
      : request.headers['stripe-signature']

    const event = verifyStripeWebhookSignature(request.body, signatureHeader)
    await handleStripeWebhook(event)
    return response.status(200).json({ received: true })
  } catch (error) {
    return response.status(400).json({ message: error instanceof Error ? error.message : 'Webhook Stripe inválido' })
  }
}
