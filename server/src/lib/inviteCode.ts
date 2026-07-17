import { randomBytes } from "crypto";

export function generateInviteCode() {
    return randomBytes(6).toString("base64url").slice(0, 8).toUpperCase();
}
