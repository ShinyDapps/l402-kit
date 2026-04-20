import { checkAndMarkPreimage } from "../replay";

describe("checkAndMarkPreimage", () => {
  it("returns true for first-time preimage", () => {
    const preimage = "a1b2c3d4".repeat(8); // 64 hex chars
    expect(checkAndMarkPreimage(preimage)).toBe(true);
  });

  it("returns false on second use of same preimage (anti-replay)", () => {
    const preimage = "dead1234".repeat(8);
    expect(checkAndMarkPreimage(preimage)).toBe(true);
    expect(checkAndMarkPreimage(preimage)).toBe(false);
  });

  it("different preimages are independent", () => {
    const p1 = "1111aaaa".repeat(8);
    const p2 = "2222bbbb".repeat(8);
    expect(checkAndMarkPreimage(p1)).toBe(true);
    expect(checkAndMarkPreimage(p2)).toBe(true);
    expect(checkAndMarkPreimage(p1)).toBe(false);
    expect(checkAndMarkPreimage(p2)).toBe(false);
  });
});
