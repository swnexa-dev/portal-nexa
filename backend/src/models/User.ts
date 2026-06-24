import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'

const userSubscriptionSchema = new Schema(
  {
    systemSlug: { type: String, required: true, trim: true },
    planSlug: { type: String, required: true, trim: true },
    stripeSubscriptionId: { type: String, default: null, trim: true },
    status: { type: String, required: true, enum: ['active', 'inactive', 'past_due'], default: 'active' },
    activatedAt: { type: Date, default: Date.now },
    currentPeriodEndsAt: { type: Date, default: null },
    renewsAutomatically: { type: Boolean, default: true },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    cancellationEffectiveAt: { type: Date, default: null },
    canceledAt: { type: Date, default: null },
    refundedAt: { type: Date, default: null },
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
    stripeCustomerId: { type: String, default: null, trim: true },
    trialStartedAt: { type: Date, required: true },
    trialEndsAt: { type: Date, required: true },
    termsAccepted: { type: Boolean, default: false },
    termsAcceptedAt: { type: Date, default: null },
    privacyAccepted: { type: Boolean, default: false },
    privacyAcceptedAt: { type: Date, default: null },
    legalTermsVersion: { type: String, default: null, trim: true },
    privacyPolicyVersion: { type: String, default: null, trim: true },
    subscriptions: { type: [userSubscriptionSchema], default: [] },
  },
  { timestamps: true }
)

export type User = InferSchemaType<typeof userSchema>
export type UserDocument = HydratedDocument<User>

export const UserModel = model('User', userSchema)
