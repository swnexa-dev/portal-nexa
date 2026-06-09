import type { UserDocument } from '../models/User.js'

export function isTrialActive(user: Pick<UserDocument, 'trialEndsAt'>) {
  return new Date(user.trialEndsAt).getTime() >= Date.now()
}

export function hasActiveSubscription(user: Pick<UserDocument, 'subscriptions'>, systemSlug: string) {
  return user.subscriptions.some((subscription) => {
    if (subscription.systemSlug !== systemSlug) return false
    if (subscription.status !== 'active') return false
    if (!subscription.currentPeriodEndsAt) return true
    return new Date(subscription.currentPeriodEndsAt).getTime() >= Date.now()
  })
}

export function canAccessSystem(user: Pick<UserDocument, 'trialEndsAt' | 'subscriptions'>, systemSlug: string) {
  return isTrialActive(user) || hasActiveSubscription(user, systemSlug)
}

export function remainingTrialDays(user: Pick<UserDocument, 'trialEndsAt'>) {
  const remaining = new Date(user.trialEndsAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(remaining / (1000 * 60 * 60 * 24)))
}
