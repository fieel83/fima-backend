import "dotenv/config";
import {
  PARADISE_TEST_GUILD_ACTIONS,
  parseParadiseTestGuildArgs,
  runParadiseTestGuildCli
} from "../src/paradiseTestGuildRunner.js";

const SAFE_SHORT_CODE_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;
const SAFE_CONFIRMATIONS = new Set(
  Object.values(PARADISE_TEST_GUILD_ACTIONS)
    .map(policy => policy.confirmation)
    .filter(Boolean)
);

function safeFailure(error) {
  const candidateCode = String(error?.code || "").trim();
  const candidateConfirmation = String(error?.expectedConfirmation || "").trim();
  return {
    ok: false,
    code: SAFE_SHORT_CODE_PATTERN.test(candidateCode)
      ? candidateCode
      : "paradise_test_guild_runner_failed",
    expectedConfirmation: SAFE_CONFIRMATIONS.has(candidateConfirmation)
      ? candidateConfirmation
      : null
  };
}

try {
  const options = parseParadiseTestGuildArgs(process.argv.slice(2));
  const result = await runParadiseTestGuildCli(options);
  process.stdout.write(`${JSON.stringify({ ok: true, ...result }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify(safeFailure(error), null, 2)}\n`);
  process.exitCode = 1;
}
