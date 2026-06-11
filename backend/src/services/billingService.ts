import crypto from 'node:crypto'
import { env } from '../config/env.js'
import { UserModel, type UserDocument } from '../models/User.js'

const allAccessSystemSlug = 'all-access'
const allAccessPlanSlug = 'all-access-monthly'

type StripeCheckoutSessionResponse = {
  id: string
  url: string | null
  customer: string | null
  subscription: string | null
}

type StripePortalSessionResponse = {
  url: string
}

type StripeSubscription = {
  id: string
  status: string
  customer: string
  current_period_end?: number
}

type StripeEvent = {
  type: string
  data: {
    object: Record<string, unknown>
  }
}

function ensureStripeConfigured() {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('Stripe não configurado. Defina STRIPE_SECRET_KEY no backend.')
  }
}

function getFrontendReturnUrl(status?: 'success' | 'cancelled') {
  if (!status) return env.FRONTEND_URL
  const url = new URL(env.FRONTEND_URL)
  url.searchParams.set('billing', status)
  return url.toString()
}

async function stripeRequest<T>(path: string, body: URLSearchParams) {
  ensureStripeConfigured()

  const response = await fetch(`https://api.stripe.com${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  const data = (await response.json()) as T & { error?: { message?: string } }
  if (!response.ok) {
    throw new Error(data.error?.message ?? 'Falha ao comunicar com o Stripe')
  }
  return data as T
}

async function getOrCreateStripeCustomer(user: UserDocument) {
  if (user.stripeCustomerId) {
    return user.stripeCustomerId
  }

  const body = new URLSearchParams()
  body.set('email', user.email)
  body.set('name', user.name)
  body.set('metadata[userId]', user._id.toString())

  const customer = await stripeRequest<{ id: string }>('/v1/customers', body)
  user.stripeCustomerId = customer.id
  await user.save()
  return customer.id
}

function buildSubscriptionStatus(stripeStatus: string): 'active' | 'inactive' | 'past_due' {
  if (stripeStatus === 'active' || stripeStatus === 'trialing') return 'active'
  if (stripeStatus === 'past_due' || stripeStatus === 'unpaid') return 'past_due'
  return 'inactive'
}

function applyAllAccessSubscription(user: UserDocument, stripeSubscription: StripeSubscription) {
  const status = buildSubscriptionStatus(stripeSubscription.status)
  const currentPeriodEndsAt = stripeSubscription.current_period_end
    ? new Date(stripeSubscription.current_period_end * 1000)
    : null

  const currentEntryIndex = user.subscriptions.findIndex((subscription) => subscription.systemSlug === allAccessSystemSlug)

  if (currentEntryIndex >= 0) {
    user.subscriptions[currentEntryIndex].planSlug = allAccessPlanSlug
    user.subscriptions[currentEntryIndex].status = status
    user.subscriptions[currentEntryIndex].activatedAt = new Date()
    user.subscriptions[currentEntryIndex].currentPeriodEndsAt = currentPeriodEndsAt
  } else {
    user.subscriptions.push({
      systemSlug: allAccessSystemSlug,
      planSlug: allAccessPlanSlug,
      status,
      activatedAt: new Date(),
      currentPeriodEndsAt,
    })
  }
}

export async function createCheckoutSession(userId: string) {
  if (!env.STRIPE_PRICE_ID_ALL_ACCESS) {
    throw new Error('Stripe não configurado. Defina STRIPE_PRICE_ID_ALL_ACCESS no backend.')
  }

  const user = await UserModel.findById(userId)
  if (!user) {
    throw new Error('Usuário não encontrado')
  }

  const customerId = await getOrCreateStripeCustomer(user)
  const body = new URLSearchParams()
  body.set('mode', 'subscription')
  body.set('customer', customerId)
  body.set('line_items[0][price]', env.STRIPE_PRICE_ID_ALL_ACCESS)
  body.set('line_items[0][quantity]', '1')
  body.set('success_url', getFrontendReturnUrl('success'))
  body.set('cancel_url', getFrontendReturnUrl('cancelled'))
  body.set('allow_promotion_codes', 'true')
  body.set('client_reference_id', user._id.toString())
  body.set('metadata[userId]', user._id.toString())
  body.set('subscription_data[metadata][userId]', user._id.toString())

  const session = await stripeRequest<StripeCheckoutSessionResponse>('/v1/checkout/sessions', body)
  if (!session.url) {
    throw new Error('O Stripe não retornou a URL de checkout')
  }

  return { url: session.url }
}

export async function createCustomerPortalSession(userId: string) {
  const user = await UserModel.findById(userId)
  if (!user) {
    throw new Error('Usuário não encontrado')
  }

  const customerId = await getOrCreateStripeCustomer(user)
  const body = new URLSearchParams()
  body.set('customer', customerId)
  body.set('return_url', getFrontendReturnUrl())

  const session = await stripeRequest<StripePortalSessionResponse>('/v1/billing_portal/sessions', body)
  return { url: session.url }
}

export async function getBillingSummary(userId: string) {
  const user = await UserModel.findById(userId)
  if (!user) {
    throw new Error('Usuário não encontrado')
  }

  const subscription = user.subscriptions.find((entry) => entry.systemSlug === allAccessSystemSlug) ?? null

  return {
    planName: 'Nexa All Access',
    priceLabel: 'Mensal via Stripe',
    includes: 'Libera todos os apps atuais e futuros do portal.',
    subscription: subscription
      ? {
          status: subscription.status,
          currentPeriodEndsAt: subscription.currentPeriodEndsAt,
        }
      : null,
    hasStripeCustomer: Boolean(user.stripeCustomerId),
  }
}

function parseStripeSignature(signatureHeader: string) {
  const parts = signatureHeader.split(',').map((part) => part.trim())
  const timestamp = parts.find((part) => part.startsWith('t='))?.slice(2)
  const signatures = parts.filter((part) => part.startsWith('v1=')).map((part) => part.slice(3))

  if (!timestamp || signatures.length === 0) {
    throw new Error('Assinatura do webhook Stripe inválida')
  }

  return { timestamp, signatures }
}

export function verifyStripeWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined) {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('Stripe não configurado. Defina STRIPE_WEBHOOK_SECRET no backend.')
  }
  if (!signatureHeader) {
    throw new Error('Cabeçalho Stripe-Signature ausente')
  }

  const { timestamp, signatures } = parseStripeSignature(signatureHeader)
  const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`
  const expectedSignature = crypto
    .createHmac('sha256', env.STRIPE_WEBHOOK_SECRET)
    .update(signedPayload, 'utf8')
    .digest('hex')

  const hasValidSignature = signatures.some((signature) => {
    const expectedBuffer = Buffer.from(expectedSignature, 'hex')
    const actualBuffer = Buffer.from(signature, 'hex')
    return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  })

  if (!hasValidSignature) {
    throw new Error('Assinatura do webhook Stripe inválida')
  }

  return JSON.parse(rawBody.toString('utf8')) as StripeEvent
}

async function findUserForStripeEvent(payload: Record<string, unknown>) {
  const customerId = typeof payload.customer === 'string' ? payload.customer : null
  if (customerId) {
    const userByCustomer = await UserModel.findOne({ stripeCustomerId: customerId })
    if (userByCustomer) return userByCustomer
  }

  const metadata = payload.metadata
  const userId =
    metadata && typeof metadata === 'object' && typeof (metadata as { userId?: unknown }).userId === 'string'
      ? (metadata as { userId: string }).userId
      : null

  if (userId) {
    return UserModel.findById(userId)
  }

  return null
}

export async function handleStripeWebhook(event: StripeEvent) {
  if (event.type === 'checkout.session.completed') {
    const payload = event.data.object
    const user = await findUserForStripeEvent(payload)
    if (!user) return

    const customerId = typeof payload.customer === 'string' ? payload.customer : null
    if (customerId && user.stripeCustomerId !== customerId) {
      user.stripeCustomerId = customerId
    }
    await user.save()
    return
  }

  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.created' || event.type === 'customer.subscription.deleted') {
    const payload = event.data.object as unknown as StripeSubscription & { metadata?: { userId?: string } }
    const user = await findUserForStripeEvent(payload as unknown as Record<string, unknown>)
    if (!user) return

    if (payload.customer && user.stripeCustomerId !== payload.customer) {
      user.stripeCustomerId = payload.customer
    }

    applyAllAccessSubscription(user, payload)
    await user.save()
  }
}
