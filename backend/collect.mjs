import { parseArgs } from "node:util";
import { sync } from "./sync.mjs";

try {
  const { values } = parseArgs({ options: { month: { type: "string" }, due: { type: "boolean" } } });
  const result = await sync({ month: values.month, manual: !values.due, log: console.log });
  if (result.busy) console.log("A sync is already running.");
  else if (result.ok || result.failed || !values.due) {
    console.log(`Sync finished · ${result.ok} sources refreshed · ${result.failed} failed`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
