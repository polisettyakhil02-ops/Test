/** Mirrors the regexes in hims-backend/src/types/common.types.ts so form validation matches what the API will accept before a round trip. */
export const ICD10_CODE_REGEX = /^[A-TV-Z][0-9][0-9AB](\.[0-9A-TV-Z]{1,4})?$/;
export const PHONE_REGEX = /^\+?[1-9]\d{7,14}$/;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
