import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { backendDir } from "./db.mjs";

if (process.platform !== "darwin") throw new Error("LaunchAgents require macOS. Use npm run triage to run the board directly.");
const action = process.argv[2];
if (!["install", "stop"].includes(action)) throw new Error("Choose install or stop.");

const domain = `gui/${process.getuid()}`;
const agents = join(homedir(), "Library", "LaunchAgents");
const data = join(backendDir, ".data");
const xml = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const schedules = [0, 15, 30, 45].map((minute) => `<dict><key>Minute</key><integer>${minute}</integer></dict>`).join("");
const identities = [
  { label: "com.monthlydiff.editorial-board", args: ["server.mjs"], policy: "<key>KeepAlive</key><true/>" },
  { label: "com.monthlydiff.release-collector", args: ["collect.mjs", "--due"],
    policy: `<key>StartCalendarInterval</key><array>${schedules}</array>` },
];

function launchctl(args, quiet = false) {
  execFileSync("/bin/launchctl", args, { stdio: quiet ? "ignore" : "inherit" });
}

function isLoaded(service) {
  try {
    launchctl(["print", service], true);
    return true;
  } catch {
    return false;
  }
}

async function unload(service) {
  if (!isLoaded(service)) return;
  launchctl(["bootout", service]);
  for (let attempt = 0; attempt < 30; attempt++) {
    if (!isLoaded(service)) return;
    await delay(100);
  }
  throw new Error(`Still waiting for ${service} to unload.`);
}

if (action === "install") {
  mkdirSync(agents, { recursive: true });
  mkdirSync(data, { recursive: true, mode: 0o700 });
}

for (const { label, args, policy } of identities) {
  const file = join(agents, `${label}.plist`);
  const service = `${domain}/${label}`;
  if (action === "stop") {
    await unload(service);
    try {
      unlinkSync(file);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    continue;
  }
  const environment = { PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" };
  if (process.env.MONTHLYDIFF_PORT) environment.MONTHLYDIFF_PORT = process.env.MONTHLYDIFF_PORT;
  if (process.env.MONTHLYDIFF_SOURCES) environment.MONTHLYDIFF_SOURCES = process.env.MONTHLYDIFF_SOURCES;
  const program = [process.execPath, join(backendDir, args[0]), ...args.slice(1)];

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${xml(label)}</string>
  <key>WorkingDirectory</key><string>${xml(backendDir)}</string>
  <key>ProgramArguments</key><array>${program.map((item) => `<string>${xml(item)}</string>`).join("")}</array>
  <key>EnvironmentVariables</key><dict>${Object.entries(environment).map(([key, value]) => `<key>${key}</key><string>${xml(value)}</string>`).join("")}</dict>
  <key>StandardOutPath</key><string>${xml(join(data, `${label}.log`))}</string>
  <key>StandardErrorPath</key><string>${xml(join(data, `${label}.error.log`))}</string>
  <key>RunAtLoad</key><true/>
  ${policy}
</dict></plist>
`;
  if (isLoaded(service) && existsSync(file) && readFileSync(file, "utf8") === plist) {
    if (args[0] === "server.mjs") launchctl(["kickstart", "-k", service]);
    continue;
  }
  await unload(service);
  writeFileSync(file, plist, { mode: 0o600 });
  launchctl(["bootstrap", domain, file]);
}

if (action === "install") console.log(`Editorial board at http://127.0.0.1:${process.env.MONTHLYDIFF_PORT || 3033}/`);
else console.log("The two Monthly Diff jobs are stopped. Editorial data is still on disk.");
