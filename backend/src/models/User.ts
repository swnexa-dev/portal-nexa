import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'

const userSubscriptionSchema = new Schema(
  {
    systemSlug: { type: String, required: true, trim: true },
    planSlug: { type: String, required: true, trim: true },
    status: { type: String, required: true, enum: ['active', 'inactive', 'past_due'], default: 'active' },
    activatedAt: { type: Date, default: Date.now },
    currentPeriodEndsAt: { type: Date, default: null },
  },
  { _id: false }
)

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    document: { type: String, required: true, trim: true, unique: true },
    documentDigits: { type: String, required: true, trim: true, unique: true },
    passwordHash: { type: String, required: true },
    trialStartedAt: { type: Date, required: true },
    trialEndsAt: { type: Date, required: true },
    subscriptions: { type: [userSubscriptionSchema], default: [] },
  },
  { timestamps: true }
)

export type User = InferSchemaType<typeof userSchema>
export type UserDocument = HydratedDocument<User>

export const UserModel = model('User', userSchema)
