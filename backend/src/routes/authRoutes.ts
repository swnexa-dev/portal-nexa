import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { loginUser, registerUser, findUserById, requestRegisterVerification, verifyRegisterCode, consumeRegisterCode } from '../services/authService.js'
import { remainingTrialDays } from '../utils/access.js'

const requestRegisterCodeSchema = z.object({
  name: z.string().trim().min(3, 'Nome muito curto').max(100, 'Nome deve ter no maximo 100 caracteres'),
  email: z.string().email('Email invalido'),
})

const verifyRegisterCodeSchema = z.object({
  email: z.string().email('Email invalido'),
  code: z.string().regex(/^\d{6}$/, 'Codigo invalido'),
})

const registerSchema = z.object({
  name: z.string().trim().min(3, 'Nome muito curto').max(100, 'Nome deve ter no maximo 100 caracteres'),
  email: z.string().email('Email invalido'),
  phone: z.string().regex(/^\(\d{2}\)\s\d{5}-\d{4}$/, 'Telefone invalido'),
  document: z
    .string()
    .regex(/^(\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})$/, 'CPF/CNPJ invalido'),
  password: z
    .string()
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/, 'Senha fora das regras'),
  passwordConfirm: z.string(),
  verificationCode: z.string().regex(/^\d{6}$/, 'Codigo invalido'),
}).refine((data) => data.password === data.passwordConfirm, {
  message: 'As senhas nao conferem',
  path: ['passwordConfirm'],
})

const loginSchema = z.object({
  email: z.string().email('Email invalido'),
  password: z.string().min(1, 'Senha obrigatoria'),
})

export const authRoutes = Router()

authRoutes.post('/register/request-code', async (request, response) => {
  try {
    const payload = requestRegisterCodeSchema.parse(request.body)
    const result = await requestRegisterVerification(payload)
    return response.status(201).json({
      message: 'Codigo enviado para o email informado',
      email: result.email,
      expiresAt: result.expiresAt,
    })
  } catch (error) {
    return response.status(400).json({ message: error instanceof Error ? error.message : 'Falha ao enviar codigo' })
  }
})

authRoutes.post('/register/verify-code', async (request, response) => {
  try {
    const payload = verifyRegisterCodeSchema.parse(request.body)
    await verifyRegisterCode(payload)
    return response.json({ verified: true })
  } catch (error) {
    return response.status(400).json({ message: error instanceof Error ? error.message : 'Falha ao validar codigo' })
  }
})

authRoutes.post('/register', async (request, response) => {
  try {
    const payload = registerSchema.parse(request.body)
    await consumeRegisterCode({ email: payload.email, code: payload.verificationCode })
    const result = await registerUser(payload)
    return response.status(201).json({
      ...result,
      meta: {
        remainingTrialDays: remainingTrialDays(result.user),
      },
    })
  } catch (error) {
    return response.status(400).json({ message: error instanceof Error ? error.message : 'Falha ao cadastrar' })
  }
})

authRoutes.post('/login', async (request, response) => {
  try {
    const payload = loginSchema.parse(request.body)
    const result = await loginUser(payload)
    return response.json({
      ...result,
      meta: {
        remainingTrialDays: remainingTrialDays(result.user),
      },
    })
  } catch (error) {
    return response.status(401).json({ message: error instanceof Error ? error.message : 'Falha ao entrar' })
  }
})

authRoutes.get('/me', requireAuth, async (request, response) => {
  const userId = request.auth?.sub
  if (!userId) {
    return response.status(401).json({ message: 'Nao autenticado' })
  }

  const user = await findUserById(userId)
  if (!user) {
    return response.status(404).json({ message: 'Usuario nao encontrado' })
  }

  return response.json({
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
    meta: {
      remainingTrialDays: remainingTrialDays(user),
    },
  })
})
