import { Schema, model, type Model, type HydratedDocument } from "mongoose";

/** A single analyte's normal range, optionally split by sex/age band. */
export interface ReferenceRange {
  parameterName: string; // e.g. "Hemoglobin"
  unit: string; // e.g. "g/dL"
  gender?: "MALE" | "FEMALE" | "ALL";
  ageMinYears?: number;
  ageMaxYears?: number;
  normalLow: number;
  normalHigh: number;
  criticalLow?: number;
  criticalHigh?: number;
}

export interface LabTestAttrs {
  testCode: string;
  testName: string;
  category: string; // e.g. "Hematology", "Biochemistry", "Microbiology"
  specimenType: string; // e.g. "Whole Blood (EDTA)", "Serum", "Urine"
  containerType: string; // e.g. "Purple-top EDTA tube"
  turnaroundTimeHours: number;
  price: number;
  referenceRanges: ReferenceRange[];
  isPanel: boolean; // true if this "test" is really a bundled panel
  panelComponentTestIds: string[]; // testCodes of components, when isPanel
  isActive: boolean;
}

export type LabTestDocument = HydratedDocument<LabTestAttrs>;

const ReferenceRangeSchema = new Schema<ReferenceRange>(
  {
    parameterName: { type: String, required: true, trim: true },
    unit: { type: String, required: true, trim: true },
    gender: { type: String, enum: ["MALE", "FEMALE", "ALL"], default: "ALL" },
    ageMinYears: { type: Number, min: 0 },
    ageMaxYears: { type: Number, min: 0 },
    normalLow: { type: Number, required: true },
    normalHigh: { type: Number, required: true },
    criticalLow: { type: Number },
    criticalHigh: { type: Number },
  },
  { _id: false },
);

const LabTestSchema = new Schema<LabTestAttrs>(
  {
    testCode: { type: String, required: true, unique: true, trim: true, uppercase: true },
    testName: { type: String, required: true, trim: true, index: true },
    category: { type: String, required: true, trim: true },
    specimenType: { type: String, required: true, trim: true },
    containerType: { type: String, required: true, trim: true },
    turnaroundTimeHours: { type: Number, required: true, min: 0 },
    price: { type: Number, required: true, min: 0 },
    referenceRanges: { type: [ReferenceRangeSchema], default: [] },
    isPanel: { type: Boolean, required: true, default: false },
    panelComponentTestIds: { type: [String], default: [] },
    isActive: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, collection: "lab_tests" },
);

LabTestSchema.index({ category: 1, isActive: 1 });

export const LabTest: Model<LabTestAttrs> = model<LabTestAttrs>("LabTest", LabTestSchema);
