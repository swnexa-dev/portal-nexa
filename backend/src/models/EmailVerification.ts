import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'

const emailVerificationSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    purpose: { type: String, required: true, enum: ['register', 'reset-password', 'notification-test'], default: 'register' },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true, index: true },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

export type EmailVerification = InferSchemaType<typeof emailVerificationSchema>
export type EmailVerificationDocument = HydratedDocument<EmailVerification>

export const EmailVerificationModel = model('EmailVerification', emailVerificationSchema)
