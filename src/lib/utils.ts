import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function bookingReference(seed = Date.now()): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let n = Math.abs(seed ^ Math.floor(Math.random() * 0xffffff));
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[n % alphabet.length] ?? 'X';
    n = Math.floor(n / alphabet.length) + 7919;
  }
  return `BN-${out}`;
}
