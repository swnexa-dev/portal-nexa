import type { UserDocument } from '../models/User.js'

const allAccessSystemSlug = 'all-access'

export function isTrialActive(user: Pick<UserDocument, 'trialEndsAt'>) {
  return new Date(user.trialEndsAt).getTime() >= Date.now()
}

function matchesSystem(subscription: UserDocument['subscriptions'][number], systemSlug: string) {
  return subscription.systemSlug === systemSlug || subscription.systemSlug === allAccessSystemSlug
}

export function hasStartedPaidSubscription(user: Pick<UserDocument, 'subscriptions'>, systemSlug = allAccessSystemSlug) {
  return user.subscriptions.some((subscription) => matchesSystem(subscription, systemSlug))
}

export function getSubscriptionAccessState(subscription: UserDocument['subscriptions'][number]) {
  const currentPeriodEndsAt = subscription.currentPeriodEndsAt ? new Date(subscription.currentPeriodEndsAt) : null
  const isWithinPaidPeriod = Boolean(currentPeriodEndsAt && currentPeriodEndsAt.getTime() >= Date.now())
  const isActive = subscription.status === 'active' && isWithinPaidPeriod && !subscription.refundedAt
  const renewsAutomatically = isActive && subscription.renewsAutomatically !== false && !subscription.cancelAtPeriodEnd

  return {
    isActive,
    renewsAutomatically,
    isCancelingAtPeriodEnd: isActive && subscription.cancelAtPeriodEnd === true,
    isInactiveByCancellation: subscription.status === 'inactive' && Boolean(subscription.canceledAt || subscription.cancellationEffectiveAt),
    isRefunded: Boolean(subscription.refundedAt),
    currentPeriodEndsAt,
  }
}

export function hasActiveSubscription(user: Pick<UserDocument, 'subscriptions'>, systemSlug: string) {
  return user.subscriptions.some((subscription) => matchesSystem(subscription, systemSlug) && getSubscriptionAccessState(subscription).isActive)
}

export function canAccessSystem(user: Pick<UserDocument, 'trialEndsAt' | 'subscriptions'>, systemSlug: string) {
  if (hasStartedPaidSubscription(user, systemSlug)) {
    return hasActiveSubscription(user, systemSlug)
  }

  return isTrialActive(user)
}

export function remainingTrialDays(user: Pick<UserDocument, 'trialEndsAt'>) {
  const remaining = new Date(user.trialEndsAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(remaining / (1000 * 60 * 60 * 24)))
}
