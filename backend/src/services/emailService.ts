import { Resend } from 'resend'
import { env } from '../config/env.js'

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null

export async function sendEmailVerificationCode(input: { email: string; code: string; name?: string }) {
  if (!resend) {
    console.warn(`RESEND_API_KEY ausente. Codigo de verificacao para ${input.email}: ${input.code}`)
    return
  }

  await resend.emails.send({
    from: env.EMAIL_FROM,
    to: input.email,
    subject: 'Seu codigo de verificacao Nexa Systems',
    html: `
      <div style="font-family:Arial,sans-serif;background:#f7f7f5;padding:24px;color:#10233b">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:18px;padding:32px;border:1px solid #e6e8ec">
          <p style="margin:0 0 12px;font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:#0f766e">Nexa Systems</p>
          <h1 style="margin:0 0 16px;font-size:28px">Confirme seu cadastro</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6">
            ${input.name ? `Ola, ${input.name}. ` : ''}Use o codigo abaixo para concluir a criacao da sua conta.
          </p>
          <div style="margin:24px 0;padding:18px 20px;border-radius:16px;background:#f1f5f9;font-size:32px;font-weight:700;letter-spacing:.3em;text-align:center">
            ${input.code}
          </div>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#475569">
            Esse codigo expira em ${env.emailCodeExpiresMinutes} minutos. Se voce nao solicitou este cadastro, ignore este email.
          </p>
        </div>
      </div>
    `,
  })
}
