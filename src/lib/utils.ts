import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Arrondit à `decimals` décimales et retire les zéros superflus (ex. 10.0 -> "10",
 * 8.5 -> "8.5") : la décimale ne s'affiche que si elle est réellement significative.
 */
export function formatDecimal(value: number, decimals = 1): string {
  return Number(value.toFixed(decimals)).toString();
}
