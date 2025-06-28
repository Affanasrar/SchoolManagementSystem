import { randomBytes } from "crypto";

function generateSecret(length = 32) {
  return randomBytes(length).toString("base64");
}

const secret = generateSecret();
console.log("✅ Your AUTH_SECRET:");
console.log(secret);
