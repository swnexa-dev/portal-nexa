import crypto from 'node:crypto'
import { env } from '../config/env.js'
import { UserModel, type UserDocument } from '../models/User.js'
import { getSubscriptionAccessState } from '../utils/access.js'

const allAccessSystemSlug = 'all-access'
const allAccessPlanSlug = 'all-access-monthly'

type StripeCheckoutSessionResponse = {
  id: string
  url: string | null
  customer: string | null
  subscription: string | null
}

type StripeCheckoutSession = {
  id: string
  customer?: string | null
  subscription?: string | StripeSubscription | null
  metadata?: { userId?: string }
}

type StripePortalSessionResponse = {
  url: string
}

type StripeSubscription = {
  id: string
  status: string
  customer: string
  current_period_end?: number
  items?: {
    data?: Array<{
      current_period_end?: number
    }>
  }
  cancel_at_period_end?: boolean
  cancel_at?: number | null
  canceled_at?: number | null
  ended_at?: number | null
  metadata?: { userId?: string }
}

type StripeRefundLike = {
  id: string
  status?: string
  customer?: string | null
  subscription?: string | null
  charge?: string | null
  payment_intent?: string | null
  refunded?: boolean
  metadata?: { userId?: string }
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

async function stripeGet<T>(path: string) {
  ensureStripeConfigured()

  const response = await fetch(`https://api.stripe.com${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    },
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

function getSubscriptionPeriodEnd(stripeSubscription: StripeSubscription) {
  return stripeSubscription.current_period_end ?? stripeSubscription.items?.data?.find((item) => item.current_period_end)?.current_period_end ?? null
}

function applyAllAccessSubscription(user: UserDocument, stripeSubscription: StripeSubscription) {
  const status = buildSubscriptionStatus(stripeSubscription.status)
  const stripePeriodEnd = getSubscriptionPeriodEnd(stripeSubscription)
  const currentPeriodEndsAt = stripePeriodEnd
    ? new Date(stripePeriodEnd * 1000)
    : null
  const cancelAtPeriodEnd = stripeSubscription.cancel_at_period_end === true
  const canceledAt = stripeSubscription.canceled_at ? new Date(stripeSubscription.canceled_at * 1000) : null
  const endedAt = stripeSubscription.ended_at ? new Date(stripeSubscription.ended_at * 1000) : null
  const cancelAt = stripeSubscription.cancel_at ? new Date(stripeSubscription.cancel_at * 1000) : null
  const cancellationEffectiveAt = status === 'inactive'
    ? endedAt ?? canceledAt ?? currentPeriodEndsAt
    : cancelAtPeriodEnd
      ? cancelAt ?? currentPeriodEndsAt
      : null
  const renewsAutomatically = status === 'active' && !cancelAtPeriodEnd

  const currentEntryIndex = user.subscriptions.findIndex((subscription) => {
    if (subscription.stripeSubscriptionId && subscription.stripeSubscriptionId === stripeSubscription.id) return true
    return subscription.systemSlug === allAccessSystemSlug
  })

  if (currentEntryIndex >= 0) {
    user.subscriptions[currentEntryIndex].planSlug = allAccessPlanSlug
    user.subscriptions[currentEntryIndex].stripeSubscriptionId = stripeSubscription.id
    user.subscriptions[currentEntryIndex].status = status
    user.subscriptions[currentEntryIndex].activatedAt = new Date()
    user.subscriptions[currentEntryIndex].currentPeriodEndsAt = currentPeriodEndsAt
    user.subscriptions[currentEntryIndex].renewsAutomatically = renewsAutomatically
    user.subscriptions[currentEntryIndex].cancelAtPeriodEnd = cancelAtPeriodEnd
    user.subscriptions[currentEntryIndex].cancellationEffectiveAt = cancellationEffectiveAt
    user.subscriptions[currentEntryIndex].canceledAt = canceledAt ?? endedAt
    if (status === 'active') {
      user.subscriptions[currentEntryIndex].refundedAt = null
    }
  } else {
    user.subscriptions.push({
      systemSlug: allAccessSystemSlug,
      planSlug: allAccessPlanSlug,
      stripeSubscriptionId: stripeSubscription.id,
      status,
      activatedAt: new Date(),
      currentPeriodEndsAt,
      renewsAutomatically,
      cancelAtPeriodEnd,
      cancellationEffectiveAt,
      canceledAt: canceledAt ?? endedAt,
      refundedAt: null,
    })
  }
}

async function getStripeSubscription(subscriptionId: string) {
  return stripeGet<StripeSubscription>(`/v1/subscriptions/${subscriptionId}`)
}

async function getCompleteStripeSubscription(payload: StripeSubscription) {
  if (getSubscriptionPeriodEnd(payload)) return payload
  return getStripeSubscription(payload.id)
}

function deactivateAllAccessSubscription(user: UserDocument, refundedAt = new Date()) {
  const currentEntryIndex = user.subscriptions.findIndex((subscription) => subscription.systemSlug === allAccessSystemSlug)

  if (currentEntryIndex < 0) return

  user.subscriptions[currentEntryIndex].status = 'inactive'
  user.subscriptions[currentEntryIndex].currentPeriodEndsAt = refundedAt
  user.subscriptions[currentEntryIndex].renewsAutomatically = false
  user.subscriptions[currentEntryIndex].cancelAtPeriodEnd = false
  user.subscriptions[currentEntryIndex].cancellationEffectiveAt = refundedAt
  user.subscriptions[currentEntryIndex].canceledAt = refundedAt
  user.subscriptions[currentEntryIndex].refundedAt = refundedAt
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
  const subscriptionState = subscription ? getSubscriptionAccessState(subscription) : null

  return {
    planName: 'Nexa All Access',
    priceLabel: 'Mensal',
    includes: 'Libera todos os apps atuais e futuros do portal.',
    subscription: subscription
      ? {
          status: subscription.status,
          currentPeriodEndsAt: subscription.currentPeriodEndsAt,
          renewsAutomatically: subscriptionState?.renewsAutomatically ?? false,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd ?? false,
          cancellationEffectiveAt: subscription.cancellationEffectiveAt,
          canceledAt: subscription.canceledAt,
          refundedAt: subscription.refundedAt,
          isActive: subscriptionState?.isActive ?? false,
          isCancelingAtPeriodEnd: subscriptionState?.isCancelingAtPeriodEnd ?? false,
          isInactiveByCancellation: subscriptionState?.isInactiveByCancellation ?? false,
          isRefunded: subscriptionState?.isRefunded ?? false,
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

async function findUserForRefundEvent(payload: StripeRefundLike) {
  if (payload.customer) {
    const userByCustomer = await UserModel.findOne({ stripeCustomerId: payload.customer })
    if (userByCustomer) return userByCustomer
  }

  if (payload.subscription) {
    const userBySubscription = await UserModel.findOne({ 'subscriptions.stripeSubscriptionId': payload.subscription })
    if (userBySubscription) return userBySubscription
  }

  if (payload.metadata?.userId) {
    const userByMetadata = await UserModel.findById(payload.metadata.userId)
    if (userByMetadata) return userByMetadata
  }

  if (payload.charge) {
    const charge = await stripeGet<{ customer?: string | null; subscription?: string | null }>(`/v1/charges/${payload.charge}`)
    return findUserForRefundEvent({ ...payload, customer: charge.customer, subscription: charge.subscription })
  }

  if (payload.payment_intent) {
    const paymentIntent = await stripeGet<{ customer?: string | null }>(`/v1/payment_intents/${payload.payment_intent}`)
    return findUserForRefundEvent({ ...payload, customer: paymentIntent.customer })
  }

  return null
}

export async function handleStripeWebhook(event: StripeEvent) {
  if (event.type === 'checkout.session.completed') {
    const payload = event.data.object as StripeCheckoutSession
    const user = await findUserForStripeEvent(payload)
    if (!user) return

    const customerId = typeof payload.customer === 'string' ? payload.customer : null
    if (customerId && user.stripeCustomerId !== customerId) {
      user.stripeCustomerId = customerId
    }

    if (typeof payload.subscription === 'string') {
      const subscription = await getStripeSubscription(payload.subscription)
      applyAllAccessSubscription(user, subscription)
    } else if (payload.subscription && typeof payload.subscription === 'object') {
      applyAllAccessSubscription(user, await getCompleteStripeSubscription(payload.subscription))
    }

    await user.save()
    return
  }

  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.created' || event.type === 'customer.subscription.deleted') {
    const payload = event.data.object as unknown as StripeSubscription
    const subscription = await getCompleteStripeSubscription(payload)
    const user = await findUserForStripeEvent(subscription as unknown as Record<string, unknown>)
    if (!user) return

    if (subscription.customer && user.stripeCustomerId !== subscription.customer) {
      user.stripeCustomerId = subscription.customer
    }

    applyAllAccessSubscription(user, subscription)
    await user.save()
    return
  }

  if (event.type === 'charge.refunded' || event.type === 'refund.created' || event.type === 'refund.updated' || event.type === 'charge.refund.updated') {
    const payload = event.data.object as StripeRefundLike
    const isRefundConfirmed = payload.refunded === true || payload.status === 'succeeded'
    if (!isRefundConfirmed) return

    const user = await findUserForRefundEvent(payload)
    if (!user) return

    deactivateAllAccessSubscription(user)
    await user.save()
  }
}
