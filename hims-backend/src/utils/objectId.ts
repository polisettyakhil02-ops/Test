import { Types } from "mongoose";
import { ValidationError } from "./errors.js";

/** Validates and converts a route/DTO string id into a Types.ObjectId, throwing a clean 400 instead of letting an invalid id reach a cast error deep in a query. */
export function toObjectId(id: string, fieldName = "id"): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) {
    throw new ValidationError(`Invalid ${fieldName}: "${id}" is not a valid ObjectId`);
  }
  return new Types.ObjectId(id);
}
