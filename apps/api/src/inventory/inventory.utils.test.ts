import { describe, expect, it } from "vitest";
import { calculateAvailability } from "./inventory.utils";

describe("calculateAvailability", () => {
  it("subtracts reservations, safety stock, damaged, and quarantined stock", () => {
    expect(calculateAvailability({
      onHand: 100,
      reserved: 12,
      incoming: 20,
      damaged: 3,
      quarantined: 5,
      safetyStock: 10,
    })).toMatchObject({
      physicalStock: 100,
      unavailableStock: 8,
      availableStock: 70,
      incomingStock: 20,
    });
  });

  it("applies a channel buffer without publishing negative stock", () => {
    const balance = { onHand: 5, reserved: 2, incoming: 0, damaged: 0, quarantined: 0, safetyStock: 1 };
    expect(calculateAvailability(balance, 1).channelAvailableStock).toBe(1);
    expect(calculateAvailability(balance, 10).channelAvailableStock).toBe(0);
  });
});
