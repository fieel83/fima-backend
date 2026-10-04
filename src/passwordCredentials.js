import crypto from "node:crypto";
import { promisify } from "node:util";
const derive = promisify(crypto.scrypt);
const N = 131072;
const options = { N, r: 8, p: 1, maxmem: 192 * 1024 * 1024 };
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const key = await derive(password, salt, 64, options);
  return `scrypt$${N}$8$1$${salt}$${key.toString("base64url")}`;
}
export async function verifyPassword(password, storedHash) {
  if (typeof password !== "string" || password.length > 200) return false;
  const parts = String(storedHash || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, expected] = parts;
  // Only supported historical/current parameters: a corrupt record must not
  // request unbounded memory, CPU, or attacker-selected output sizes.
  if (!["16384", String(N)].includes(n) || r !== "8" || p !== "1"
    || !/^[A-Za-z0-9_-]{22}$/.test(salt) || !/^[A-Za-z0-9_-]{86}$/.test(expected)) return false;
  const key = await derive(password, salt, 64, { ...options, N: Number(n) });
  return crypto.timingSafeEqual(Buffer.from(expected, "base64url"), key);
}
export function passwordNeedsUpgrade(hash) { return !String(hash).startsWith(`scrypt$${N}$8$1$`); }
