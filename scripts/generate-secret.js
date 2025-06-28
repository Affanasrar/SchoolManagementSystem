"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var crypto_1 = require("crypto");
function generateSecret(length) {
    if (length === void 0) { length = 32; }
    return (0, crypto_1.randomBytes)(length).toString("base64");
}
var secret = generateSecret();
console.log("✅ Your AUTH_SECRET:");
console.log(secret);
