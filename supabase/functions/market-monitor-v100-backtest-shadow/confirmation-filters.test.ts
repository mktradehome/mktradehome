import { fourHourConfirmationBlock } from "./confirmation-filters.ts";

Deno.test("allows BUY only when 4H explicitly signals BUY", () => {
  if (fourHourConfirmationBlock("BUY", "BUY") !== null) throw new Error("aligned BUY should pass");
  if (fourHourConfirmationBlock("BUY", "WAIT") !== "4H_SIGNAL_NOT_CONFIRMED") throw new Error("4H WAIT must block BUY");
  if (fourHourConfirmationBlock("BUY", "SELL") !== "4H_SIGNAL_NOT_CONFIRMED") throw new Error("opposing 4H SELL must block BUY");
});

Deno.test("allows SELL only when 4H explicitly signals SELL", () => {
  if (fourHourConfirmationBlock("SELL", "SELL") !== null) throw new Error("aligned SELL should pass");
  if (fourHourConfirmationBlock("SELL", "WAIT") !== "4H_SIGNAL_NOT_CONFIRMED") throw new Error("4H WAIT must block SELL");
  if (fourHourConfirmationBlock("SELL", "BUY") !== "4H_SIGNAL_NOT_CONFIRMED") throw new Error("opposing 4H BUY must block SELL");
});
