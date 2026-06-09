import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  PORT: z.string().default('3000'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI obrigatorio'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET obrigatorio'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  SSO_JWT_EXPIRES_IN: z.string().default('8h'),
  TRIAL_DAYS: z.string().default('14'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  CORS_ORIGIN: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('Nexa Systems <onboarding@resend.dev>'),
  EMAIL_CODE_EXPIRES_MINUTES: z.string().default('15'),
  FLUXIO_URL: z.string().optional(),
  CHECKLISTS_URL: z.string().optional(),
  AGENDAMENTOS_URL: z.string().optional()
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  throw new Error(`Configuracao invalida: ${parsed.error.issues.map((issue) => issue.message).join(', ')}`)
}

export const env = {
  ...parsed.data,
  port: Number(parsed.data.PORT),
  trialDays: Number(parsed.data.TRIAL_DAYS),
  emailCodeExpiresMinutes: Number(parsed.data.EMAIL_CODE_EXPIRES_MINUTES),
}
