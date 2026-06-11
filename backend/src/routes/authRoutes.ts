import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { loginUser, registerUser, findUserById, requestRegisterVerification, verifyRegisterCode, consumeRegisterCode, requestPasswordReset, verifyPasswordResetCode, resetPassword } from '../services/authService.js'
import { remainingTrialDays } from '../utils/access.js'

function hasRepeatedDigits(value: string) {
  return /^(\d)\1+$/.test(value)
}

function isValidCpf(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 11 || hasRepeatedDigits(digits)) return false

  let sum = 0
  for (let index = 0; index < 9; index += 1) {
    sum += Number(digits[index]) * (10 - index)
  }

  let check = (sum * 10) % 11
  if (check === 10) check = 0
  if (check !== Number(digits[9])) return false

  sum = 0
  for (let index = 0; index < 10; index += 1) {
    sum += Number(digits[index]) * (11 - index)
  }

  check = (sum * 10) % 11
  if (check === 10) check = 0
  return check === Number(digits[10])
}

function isValidCnpj(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 14 || hasRepeatedDigits(digits)) return false

  const calculateCheckDigit = (base: string, factors: number[]) => {
    const sum = base.split('').reduce((accumulator, digit, index) => {
      return accumulator + Number(digit) * factors[index]
    }, 0)

    const remainder = sum % 11
    return remainder < 2 ? 0 : 11 - remainder
  }

  const firstCheck = calculateCheckDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  if (firstCheck !== Number(digits[12])) return false

  const secondCheck = calculateCheckDigit(digits.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return secondCheck === Number(digits[13])
}

function isValidCpfOrCnpj(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.length === 11) return isValidCpf(digits)
  if (digits.length === 14) return isValidCnpj(digits)
  return false
}

const requestRegisterCodeSchema = z.object({
  name: z.string().trim().min(3, 'Nome muito curto').max(100, 'Nome deve ter no máximo 100 caracteres'),
  email: z.string().email('E-mail inválido'),
})

const verifyRegisterCodeSchema = z.object({
  email: z.string().email('E-mail inválido'),
  code: z.string().regex(/^\d{6}$/, 'Código inválido'),
})

const registerSchema = z.object({
  name: z.string().trim().min(3, 'Nome muito curto').max(100, 'Nome deve ter no máximo 100 caracteres'),
  email: z.string().email('E-mail inválido'),
  phone: z.string().regex(/^\(\d{2}\)\s\d{5}-\d{4}$/, 'Telefone inválido'),
  document: z
    .string()
    .regex(/^(\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})$/, 'CPF/CNPJ inválido'),
  password: z
    .string()
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/, 'Senha fora das regras'),
  passwordConfirm: z.string(),
  verificationCode: z.string().regex(/^\d{6}$/, 'Código inválido'),
}).refine((data) => data.password === data.passwordConfirm, {
  message: 'As senhas não conferem',
  path: ['passwordConfirm'],
}).refine((data) => isValidCpfOrCnpj(data.document), {
  message: 'Digite um CPF ou CNPJ válido',
  path: ['document'],
})

const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Senha obrigatória'),
})

const requestPasswordResetSchema = z.object({
  email: z.string().email('E-mail inválido'),
})

const verifyPasswordResetSchema = z.object({
  email: z.string().email('E-mail inválido'),
  code: z.string().regex(/^\d{6}$/, 'Código inválido'),
})

const resetPasswordSchema = z.object({
  email: z.string().email('E-mail inválido'),
  code: z.string().regex(/^\d{6}$/, 'Código inválido'),
  password: z
    .string()
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/, 'Senha fora das regras'),
  passwordConfirm: z.string(),
}).refine((data) => data.password === data.passwordConfirm, {
  message: 'As senhas não conferem',
  path: ['passwordConfirm'],
})

export const authRoutes = Router()

authRoutes.post('/register/request-code', async (request, response) => {
  try {
    const payload = requestRegisterCodeSchema.parse(request.body)
    const result = await requestRegisterVerification(payload)
    return response.status(201).json({
      message: 'Código enviado para o e-mail informado',
      email: result.email,
      expiresAt: result.expiresAt,
    })
  } catch (error) {
    return response.status(400).json({ message: error instanceof Error ? error.message : 'Falha ao enviar código' })
  }
})

authRoutes.post('/register/verify-code', async (request, response) => {
  try {
    const payload = verifyRegisterCodeSchema.parse(request.body)
    await verifyRegisterCode(payload)
    return response.json({ verified: true })
  } catch (error) {
    return response.status(400).json({ message: error instanceof Error ? error.message : 'Falha ao validar código' })
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

authRoutes.post('/password-reset/request-code', async (request, response) => {
  try {
    const payload = requestPasswordResetSchema.parse(request.body)
    const result = await requestPasswordReset(payload)
    return response.status(201).json({
      message: 'Código enviado para o e-mail informado',
      email: result.email,
      expiresAt: result.expiresAt,
    })
  } catch (error) {
    return response.status(400).json({ message: error instanceof Error ? error.message : 'Falha ao enviar código' })
  }
})

authRoutes.post('/password-reset/verify-code', async (request, response) => {
  try {
    const payload = verifyPasswordResetSchema.parse(request.body)
    await verifyPasswordResetCode(payload)
    return response.json({ verified: true })
  } catch (error) {
    return response.status(400).json({ message: error instanceof Error ? error.message : 'Falha ao validar código' })
  }
})

authRoutes.post('/password-reset/confirm', async (request, response) => {
  try {
    const payload = resetPasswordSchema.parse(request.body)
    await resetPassword(payload)
    return response.json({ success: true, message: 'Senha redefinida com sucesso' })
  } catch (error) {
    return response.status(400).json({ message: error instanceof Error ? error.message : 'Falha ao redefinir senha' })
  }
})

authRoutes.get('/me', requireAuth, async (request, response) => {
  const userId = request.auth?.sub
  if (!userId) {
    return response.status(401).json({ message: 'Não autenticado' })
  }

  const user = await findUserById(userId)
  if (!user) {
    return response.status(404).json({ message: 'Usuário não encontrado' })
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
