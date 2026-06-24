import { currentLegalTermsVersion, currentPrivacyPolicyVersion } from '../config/legal.js'
import { UserModel, type UserDocument } from '../models/User.js'

export function buildLegalAcceptancePayload(user: UserDocument) {
  return {
    termsAccepted: user.termsAccepted === true,
    termsAcceptedAt: user.termsAcceptedAt ?? null,
    privacyAccepted: user.privacyAccepted === true,
    privacyAcceptedAt: user.privacyAcceptedAt ?? null,
    legalTermsVersion: user.legalTermsVersion ?? null,
    privacyPolicyVersion: user.privacyPolicyVersion ?? null,
  }
}

export function buildPublicUser(user: UserDocument) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone,
    document: user.document,
    trialStartedAt: user.trialStartedAt,
    trialEndsAt: user.trialEndsAt,
    subscriptions: user.subscriptions,
    ...buildLegalAcceptancePayload(user),
  }
}

export async function acceptCurrentLegalDocuments(userId: string) {
  const user = await UserModel.findById(userId)
  if (!user) {
    throw new Error('Usuário não encontrado')
  }

  const acceptedAt = new Date()
  user.termsAccepted = true
  user.termsAcceptedAt = acceptedAt
  user.privacyAccepted = true
  user.privacyAcceptedAt = acceptedAt
  user.legalTermsVersion = currentLegalTermsVersion
  user.privacyPolicyVersion = currentPrivacyPolicyVersion

  await user.save()

  return {
    success: true,
    user: buildPublicUser(user),
  }
}
