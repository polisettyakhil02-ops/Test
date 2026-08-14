import { Schema, model, models, type Model, type HydratedDocument } from 'mongoose'
import bcrypt from 'bcryptjs'

export interface IUser {
  name: string
  email: string
  passwordHash: string
  role: 'admin' | 'staff'
  createdAt: Date
  updatedAt: Date
}

export interface IUserMethods {
  comparePassword(candidate: string): Promise<boolean>
}

type UserModel = Model<IUser, Record<string, never>, IUserMethods>

const UserSchema = new Schema<IUser, UserModel, IUserMethods>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    passwordHash: {
      type: String,
      required: [true, 'Password is required'],
      // Never ship the hash to the client by accident. Auth explicitly opts in
      // with `.select('+passwordHash')`.
      select: false,
    },
    role: {
      type: String,
      enum: ['admin', 'staff'],
      default: 'admin',
    },
  },
  { timestamps: true },
)

UserSchema.methods.comparePassword = function (
  this: HydratedDocument<IUser>,
  candidate: string,
): Promise<boolean> {
  if (!this.passwordHash) {
    // Guards the case where the doc was loaded without `+passwordHash`.
    throw new Error(
      'passwordHash was not selected on this document. ' +
        "Query with .select('+passwordHash') before calling comparePassword.",
    )
  }
  return bcrypt.compare(candidate, this.passwordHash)
}

/** Hash a plaintext password. Used by the admin-creation script. */
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12)
}

// `models.User ||` keeps hot reload from throwing OverwriteModelError.
export const User =
  (models.User as UserModel) || model<IUser, UserModel>('User', UserSchema)

export default User
