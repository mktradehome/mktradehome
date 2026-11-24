export interface BrokerExecutionFill {
  price: number;
  retcode: 10009;
}

export function parseConfirmedBrokerFill(message: unknown): BrokerExecutionFill | null {
  if (typeof message !== "string" || message.length === 0 || message.length > 1000) return null;
  if (!message.startsWith("MT5 market order confirmed.")) return null;
  if (!/(?:^|;\\s*)retcode=10009(?:;|$)/.test(message)) return null;
  const match = message.match(/(?:^|;\\s*)price=([0-9]+(?:\\.[0-9]+)?)(?:;|$)/);
  if (!match) return null;
  const price = Number(match[1]);
  if (!Number.isFinite(price) || price <= 0) return null;
  return { price, retcode: 10009 };
}
