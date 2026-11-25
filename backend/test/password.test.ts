import { describe, expect, it } from "vitest";
import { checkPassword, hashPassword } from "../src/lib/hash.js";

describe("password hashing", () => {
  it("stores a non-plaintext hash and compares passwords correctly", async () => {
    const password = "CorrectHorseBattery!92";
    const hash = await hashPassword(password);

    expect(hash).not.toBe(password);
    expect(await checkPassword(password, hash)).toBe(true);
    expect(await checkPassword("incorrect-password", hash)).toBe(false);
  }, 20_000);
});
