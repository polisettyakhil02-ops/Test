import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";

/** Recurring weekly template a doctor works; concrete bookable slots are materialized per-day into OPDQueue. */
export interface DoctorScheduleAttrs {
  doctorId: Types.ObjectId;
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday
  startTime: string; // "09:00" 24h local clinic time
  endTime: string; // "13:00"
  slotDurationMinutes: number;
  maxTokensPerSlot: number;
  roomNumber?: string;
  effectiveFrom: Date;
  effectiveTo?: Date;
  isActive: boolean;
}

export type DoctorScheduleDocument = HydratedDocument<DoctorScheduleAttrs>;

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

const DoctorScheduleSchema = new Schema<DoctorScheduleAttrs>(
  {
    doctorId: { type: Schema.Types.ObjectId, ref: "Doctor", required: true, index: true },
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
    startTime: { type: String, required: true, match: TIME_REGEX },
    endTime: { type: String, required: true, match: TIME_REGEX },
    slotDurationMinutes: { type: Number, required: true, min: 5, default: 15 },
    maxTokensPerSlot: { type: Number, required: true, min: 1, default: 1 },
    roomNumber: { type: String, trim: true },
    effectiveFrom: { type: Date, required: true },
    effectiveTo: { type: Date },
    isActive: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, collection: "doctor_schedules" },
);

DoctorScheduleSchema.pre("validate", function preValidate(next) {
  if (this.startTime >= this.endTime) {
    next(new Error("startTime must be before endTime"));
    return;
  }
  next();
});

DoctorScheduleSchema.index({ doctorId: 1, dayOfWeek: 1, isActive: 1 });

export const DoctorSchedule: Model<DoctorScheduleAttrs> = model<DoctorScheduleAttrs>(
  "DoctorSchedule",
  DoctorScheduleSchema,
);
