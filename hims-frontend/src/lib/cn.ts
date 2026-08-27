import { clsx, type ClassValue } from "clsx";

/** Thin wrapper around clsx so components can compose conditional class lists without importing clsx everywhere directly. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
