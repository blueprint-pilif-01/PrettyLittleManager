export type InventoryBalanceValues = {
  onHand: number;
  reserved: number;
  incoming: number;
  damaged: number;
  quarantined: number;
  safetyStock: number;
};

export function calculateAvailability(balance: InventoryBalanceValues, channelBuffer = 0) {
  const unavailable = balance.damaged + balance.quarantined;
  const available = balance.onHand - balance.reserved - balance.safetyStock - unavailable;
  return {
    physicalStock: balance.onHand,
    reservedStock: balance.reserved,
    incomingStock: balance.incoming,
    damagedStock: balance.damaged,
    quarantinedStock: balance.quarantined,
    safetyStock: balance.safetyStock,
    unavailableStock: unavailable,
    availableStock: available,
    channelBuffer,
    channelAvailableStock: Math.max(available - channelBuffer, 0),
  };
}
