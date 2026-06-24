import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  PORT: z.string().default('3000'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI obrigatório'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET obrigatório'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  SSO_JWT_EXPIRES_IN: z.string().default('8h'),
  TRIAL_DAYS: z.string().default('14'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  CORS_ORIGIN: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('Nexa Systems <onboarding@resend.dev>'),
  EMAIL_CODE_EXPIRES_MINUTES: z.string().default('15'),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_ID_ALL_ACCESS: z.string().optional(),
  LEGAL_TERMS_VERSION: z.string().default('2026-06'),
  PRIVACY_POLICY_VERSION: z.string().default('2026-06'),
  FLUXIO_URL: z.string().optional(),
  CHECKLISTS_URL: z.string().optional(),
  AGENDAMENTOS_URL: z.string().optional()
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  throw new Error(`Configuração inválida: ${parsed.error.issues.map((issue) => issue.message).join(', ')}`)
}

export const env = {
  ...parsed.data,
  port: Number(parsed.data.PORT),
  trialDays: Number(parsed.data.TRIAL_DAYS),
  emailCodeExpiresMinutes: Number(parsed.data.EMAIL_CODE_EXPIRES_MINUTES),
}
