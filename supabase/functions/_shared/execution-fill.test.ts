import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseConfirmedBrokerFill } from "./execution-fill.ts";

Deno.test("parses a confirmed EURUSD broker fill", () => {
  assertEquals(
    parseConfirmedBrokerFill("MT5 market order confirmed. Symbol=EURUSDm; side=SELL; volume=0.01; price=1.09094; retcode=10009; position_id=596468004"),
    { price: 1.09094, retcode: 10009 },
  );
});

Deno.test("parses a confirmed BTCUSD broker fill without changing precision", () => {
  assertEquals(
    parseConfirmedBrokerFill("MT5 market order confirmed. Symbol=BTCUSDm; side=BUY; volume=0.01; price=63303.81; retcode=10009; position_id=596033683"),
    { price: 63303.81, retcode: 10009 },
  );
});

Deno.test("rejects a missing price", () => {
  assertEquals(parseConfirmedBrokerFill("MT5 market order confirmed. Symbol=EURUSDm; retcode=10009"), null);
});

Deno.test("rejects a failed broker retcode", () => {
  assertEquals(parseConfirmedBrokerFill("MT5 market order confirmed. price=1.09; retcode=10006"), null);
});

Deno.test("rejects malformed, non-positive and non-finite prices", () => {
  for (const price of ["abc", "0", "-1", "NaN", "Infinity"]) {
    assertEquals(parseConfirmedBrokerFill(`MT5 market order confirmed. price=${price}; retcode=10009`), null);
  }
});

Deno.test("rejects untrusted or oversized execution messages", () => {
  assertEquals(parseConfirmedBrokerFill("price=1.09; retcode=10009"), null);
  assertEquals(parseConfirmedBrokerFill("x".repeat(1001)), null);
  assertEquals(parseConfirmedBrokerFill(null), null);
});
