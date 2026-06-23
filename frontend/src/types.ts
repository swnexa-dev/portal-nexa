export type UserSubscription = {
  systemSlug: string
  planSlug: string
  stripeSubscriptionId: string | null
  status: 'active' | 'inactive' | 'past_due'
  activatedAt: string
  currentPeriodEndsAt: string | null
  renewsAutomatically: boolean
  cancelAtPeriodEnd: boolean
  cancellationEffectiveAt: string | null
  canceledAt: string | null
  refundedAt: string | null
}

export type AuthUser = {
  id: string
  name: string
  email: string
  phone: string
  document: string
  trialStartedAt: string
  trialEndsAt: string
  subscriptions: UserSubscription[]
}

export type CatalogSystem = {
  slug: string
  name: string
  description: string
  accent: string
  launchUrl: string
  plans: Array<{
    slug: string
    name: string
    priceLabel: string
    description: string
  }>
  access: {
    allowed: boolean
    viaTrial: boolean
    hasSubscription: boolean
  }
}

export type AuthResponse = {
  accessToken: string
  user: AuthUser
  meta: {
    remainingTrialDays: number
  }
}

export type BillingSummary = {
  planName: string
  priceLabel: string
  includes: string
  subscription: {
    status: 'active' | 'inactive' | 'past_due'
    currentPeriodEndsAt: string | null
    renewsAutomatically: boolean
    cancelAtPeriodEnd: boolean
    cancellationEffectiveAt: string | null
    canceledAt: string | null
    refundedAt: string | null
    isActive: boolean
    isCancelingAtPeriodEnd: boolean
    isInactiveByCancellation: boolean
    isRefunded: boolean
  } | null
  hasStripeCustomer: boolean
}
