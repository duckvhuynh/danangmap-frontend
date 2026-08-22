import { createHmac } from "node:crypto";
import { expect, type Page, type Response } from "@playwright/test";

export interface RealStackLoginEnvironment {
  login: string;
  password: string;
  totpSecret: string;
}

const lastTotpCounterByLogin = new Map<string, number>();

export function requiredEnv(name: string, scope = "the real-stack project") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for ${scope}.`);
  return value;
}

function decodeBase32(value: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = value.toUpperCase().replace(/=+$/u, "");
  let bits = "";
  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("The real-stack TOTP seed is not valid Base32.");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

export function totp(secret: string, now = Date.now()) {
  const counter = BigInt(Math.floor(now / 30_000));
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(counter);
  const digest = createHmac("sha1", decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = ((digest[offset]! & 0x7f) << 24)
    | ((digest[offset + 1]! & 0xff) << 16)
    | ((digest[offset + 2]! & 0xff) << 8)
    | (digest[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

export async function waitForNextTotpStep(page: Page) {
  const waitMilliseconds = 30_000 - (Date.now() % 30_000) + 1_000;
  await page.waitForTimeout(waitMilliseconds);
}

export async function freshTotp(page: Page, secret: string, loginIdentity?: string) {
  let counter = Math.floor(Date.now() / 30_000);
  if (loginIdentity && (lastTotpCounterByLogin.get(loginIdentity) ?? -1) >= counter) {
    await waitForNextTotpStep(page);
    counter = Math.floor(Date.now() / 30_000);
  }
  const secondsRemaining = 30 - (Math.floor(Date.now() / 1_000) % 30);
  if (secondsRemaining < 5) await page.waitForTimeout((secondsRemaining + 1) * 1_000);
  counter = Math.floor(Date.now() / 30_000);
  if (loginIdentity) lastTotpCounterByLogin.set(loginIdentity, counter);
  return totp(secret);
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

async function isRejectedGeneratedTotp(response: Response) {
  if (response.status() !== 401) return false;
  const body: unknown = await response.json().catch(() => undefined);
  return isRecord(body) && body.code === "AUTH_MFA_INVALID";
}

async function submitGeneratedTotp(page: Page, secret: string, loginIdentity: string) {
  await page.getByLabel("Mã xác thực 6 số").fill(await freshTotp(page, secret, loginIdentity));
  const verification = page.waitForResponse((response) => response.url().endsWith("/api/v1/auth/mfa/verify") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Xác nhận" }).click();
  return verification;
}

export async function loginWithMfa(page: Page, environment: RealStackLoginEnvironment) {
  const secret = requiredEnv(environment.totpSecret);
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Tên đăng nhập hoặc email" }).fill(requiredEnv(environment.login));
  await page.getByLabel("Mật khẩu").fill(requiredEnv(environment.password));
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/login\/mfa$/u);
  const firstVerification = await submitGeneratedTotp(page, secret, environment.login);
  if (await isRejectedGeneratedTotp(firstVerification) && new URL(page.url()).pathname === "/login/mfa") {
    await waitForNextTotpStep(page);
    await submitGeneratedTotp(page, secret, environment.login);
  }
  await expect(page).toHaveURL(/\/admin$/u);
  await expect(page.getByRole("heading", { name: "Tổng quan hệ thống" })).toBeVisible();
}
