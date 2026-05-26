import crypto from "crypto";

/**
 * DGA Digital ID consumer-secret hashing algorithm.
 *
 * The Consumer Secret must be MD5-hashed 7 times before use.
 * Each round appends the salt "EGA" to the input before hashing,
 * and the output is lowercase hex.
 *
 * Reference: https://digitalid-manual.egov.go.th/development-guide/consumer-secret-hash.html
 *
 * Example: hashConsumerSecret("<your-secret>") returns the pre-hashed hex string.
 */
export function hashConsumerSecret(secret: string, rounds = 7): string {
  let result = secret;
  for (let i = 0; i < rounds; i++) {
    result = crypto
      .createHash("md5")
      .update(result + "EGA", "utf8")
      .digest("hex")
      .toLowerCase();
  }
  return result;
}
