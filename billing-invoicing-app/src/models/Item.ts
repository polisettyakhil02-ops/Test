import { Schema, model, models, type Model } from 'mongoose'

export interface IItem {
  name: string
  description: string
  hsnSac: string
  unit: string
  price: number
  taxRate: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const ItemSchema = new Schema<IItem>(
  {
    name: {
      type: String,
      required: [true, 'Item name is required'],
      trim: true,
    },
    description: { type: String, trim: true, default: '' },
    hsnSac: {
      type: String,
      trim: true,
      default: '',
    },
    unit: { type: String, trim: true, default: 'unit' },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative'],
      default: 0,
    },
    taxRate: {
      type: Number,
      min: [0, 'Tax rate cannot be negative'],
      max: [100, 'Tax rate cannot exceed 100'],
      default: 0,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
)

ItemSchema.index({ name: 'text', hsnSac: 'text' })

export const Item = (models.Item as Model<IItem>) || model<IItem>('Item', ItemSchema)

export default Item
