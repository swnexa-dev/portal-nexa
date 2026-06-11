import bcrypt from 'bcryptjs'
import { env } from '../config/env.js'
import { UserModel, type UserDocument } from '../models/User.js'
import { EmailVerificationModel } from '../models/EmailVerification.js'
import { sendEmailVerificationCode, sendPasswordResetCode } from './emailService.js'
import { signPortalToken } from '../utils/jwt.js'
import { generateSixDigitCode, hashCode } from '../utils/code.js'

function buildTrialEndDate() {
  const result = new Date()
  result.setDate(result.getDate() + env.trialDays)
  return result
}

export async function registerUser(input: {
  name: string
  email: string
  phone: string
  document: string
  password: string
}) {
  const email = input.email.trim().toLowerCase()
  const documentDigits = input.document.replace(/\D/g, '')
  const existingUser = await UserModel.findOne({ email })

  if (existingUser) {
    throw new Error('E-mail já cadastrado')
  }

  const existingDocument = await UserModel.findOne({ documentDigits })
  if (existingDocument) {
    throw new Error('CPF/CNPJ já cadastrado')
  }

  const passwordHash = await bcrypt.hash(input.password, 12)
  const now = new Date()
  const user = await UserModel.create({
    name: input.name.trim(),
    email,
    phone: input.phone.trim(),
    document: input.document.trim(),
    documentDigits,
    passwordHash,
    trialStartedAt: now,
    trialEndsAt: buildTrialEndDate(),
    subscriptions: [],
  })

  return buildAuthPayload(user)
}

export async function requestRegisterVerification(input: { email: string; name?: string }) {
  const email = input.email.trim().toLowerCase()
  const existingUser = await UserModel.findOne({ email })

  if (existingUser) {
    throw new Error('E-mail já cadastrado')
  }

  const code = generateSixDigitCode()
  const expiresAt = new Date(Date.now() + env.emailCodeExpiresMinutes * 60 * 1000)

  await EmailVerificationModel.deleteMany({ email, purpose: 'register', consumedAt: null })
  await EmailVerificationModel.create({
    email,
    purpose: 'register',
    codeHash: hashCode(code),
    expiresAt,
  })

  await sendEmailVerificationCode({ email, code, name: input.name })

  return {
    email,
    expiresAt,
  }
}

export async function verifyRegisterCode(input: { email: string; code: string }) {
  const email = input.email.trim().toLowerCase()
  const verification = await EmailVerificationModel.findOne({
    email,
    purpose: 'register',
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 })

  if (!verification) {
    throw new Error('Código expirado ou inexistente')
  }

  verification.attempts += 1

  if (verification.codeHash !== hashCode(input.code)) {
    await verification.save()
    throw new Error('Código inválido')
  }

  return { verified: true }
}

export async function consumeRegisterCode(input: { email: string; code: string }) {
  const email = input.email.trim().toLowerCase()
  const verification = await EmailVerificationModel.findOne({
    email,
    purpose: 'register',
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 })

  if (!verification) {
    throw new Error('Código expirado ou inexistente')
  }

  verification.attempts += 1

  if (verification.codeHash !== hashCode(input.code)) {
    await verification.save()
    throw new Error('Código inválido')
  }

  verification.consumedAt = new Date()
  await verification.save()

  return { consumed: true }
}

export async function loginUser(input: { email: string; password: string }) {
  const email = input.email.trim().toLowerCase()
  const user = await UserModel.findOne({ email })

  if (!user) {
    throw new Error('Credenciais inválidas')
  }

  const validPassword = await bcrypt.compare(input.password, user.passwordHash)
  if (!validPassword) {
    throw new Error('Credenciais inválidas')
  }

  return buildAuthPayload(user)
}

export async function requestPasswordReset(input: { email: string }) {
  const email = input.email.trim().toLowerCase()
  const user = await UserModel.findOne({ email })

  if (!user) {
    throw new Error('Não encontramos uma conta com esse e-mail')
  }

  const code = generateSixDigitCode()
  const expiresAt = new Date(Date.now() + env.emailCodeExpiresMinutes * 60 * 1000)

  await EmailVerificationModel.deleteMany({ email, purpose: 'reset-password', consumedAt: null })
  await EmailVerificationModel.create({
    email,
    purpose: 'reset-password',
    codeHash: hashCode(code),
    expiresAt,
  })

  await sendPasswordResetCode({ email, code, name: user.name })

  return { email, expiresAt }
}

export async function verifyPasswordResetCode(input: { email: string; code: string }) {
  const email = input.email.trim().toLowerCase()
  const verification = await EmailVerificationModel.findOne({
    email,
    purpose: 'reset-password',
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 })

  if (!verification) {
    throw new Error('Código expirado ou inexistente')
  }

  verification.attempts += 1

  if (verification.codeHash !== hashCode(input.code)) {
    await verification.save()
    throw new Error('Código inválido')
  }

  return { verified: true }
}

export async function resetPassword(input: { email: string; code: string; password: string }) {
  const email = input.email.trim().toLowerCase()
  const verification = await EmailVerificationModel.findOne({
    email,
    purpose: 'reset-password',
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 })

  if (!verification) {
    throw new Error('Código expirado ou inexistente')
  }

  verification.attempts += 1

  if (verification.codeHash !== hashCode(input.code)) {
    await verification.save()
    throw new Error('Código inválido')
  }

  const user = await UserModel.findOne({ email })
  if (!user) {
    throw new Error('Usuário não encontrado')
  }

  user.passwordHash = await bcrypt.hash(input.password, 12)
  await user.save()

  verification.consumedAt = new Date()
  await verification.save()

  return { reset: true }
}

export async function findUserById(userId: string) {
  return UserModel.findById(userId)
}

function buildAuthPayload(user: UserDocument) {
  const accessToken = signPortalToken({
    sub: user._id.toString(),
    email: user.email,
    name: user.name,
    role: 'customer',
  })

  return {
    accessToken,
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      phone: user.phone,
      document: user.document,
      trialStartedAt: user.trialStartedAt,
      trialEndsAt: user.trialEndsAt,
      subscriptions: user.subscriptions,
    },
  }
}
