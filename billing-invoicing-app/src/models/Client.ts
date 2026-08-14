import { Schema, model, models, type Model } from 'mongoose'

export interface IAddress {
  line1: string
  line2: string
  city: string
  state: string
  postalCode: string
  country: string
}

export interface IClient {
  name: string
  email: string
  phone: string
  gstin: string
  billingAddress: IAddress
  notes: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export const AddressSchema = new Schema<IAddress>(
  {
    line1: { type: String, trim: true, default: '' },
    line2: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    postalCode: { type: String, trim: true, default: '' },
    country: { type: String, trim: true, default: 'India' },
  },
  { _id: false },
)

const ClientSchema = new Schema<IClient>(
  {
    name: {
      type: String,
      required: [true, 'Client name is required'],
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    phone: { type: String, trim: true, default: '' },
    gstin: {
      type: String,
      trim: true,
      uppercase: true,
      default: '',
    },
    billingAddress: {
      type: AddressSchema,
      default: () => ({}),
    },
    notes: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
)

// Supports the client list's search box.
ClientSchema.index({ name: 'text', email: 'text', gstin: 'text' })

export const Client =
  (models.Client as Model<IClient>) || model<IClient>('Client', ClientSchema)

export default Client
