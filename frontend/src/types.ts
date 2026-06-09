export type UserSubscription = {
  systemSlug: string
  planSlug: string
  status: 'active' | 'inactive' | 'past_due'
  activatedAt: string
  currentPeriodEndsAt: string | null
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
