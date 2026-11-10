import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";

const root = process.cwd();
const arg = name => {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
};
let executable = arg("--app");
let appArgument;
let installed;
let mounted;
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "rehab-desktop-test-"));
const data = path.join(temp, "data with spaces 日本語");
await fs.mkdir(data, { recursive: true });
const installer = arg("--installer");
const dmg = arg("--dmg");
try {
  if (installer) {
    if (process.platform !== "win32")
      throw new Error("Windows installer test must run on Windows");
    installed = path.join(temp, "Installed RehabPredict");
    execFileSync(path.resolve(installer), ["/S", `/D=${installed}`], {
      stdio: "inherit",
      timeout: 180_000,
    });
    executable = path.join(installed, "RehabPredict.exe");
  } else if (dmg) {
    if (process.platform !== "darwin")
      throw new Error("DMG test must run on macOS");
    mounted = path.join(temp, "mounted");
    await fs.mkdir(mounted);
    execFileSync(
      "hdiutil",
      [
        "attach",
        path.resolve(dmg),
        "-readonly",
        "-nobrowse",
        "-mountpoint",
        mounted,
      ],
      { stdio: "inherit", timeout: 120_000 }
    );
    const copy = path.join(
      temp,
      "Applications with spaces",
      "RehabPredict.app"
    );
    await fs.mkdir(path.dirname(copy));
    execFileSync("ditto", [path.join(mounted, "RehabPredict.app"), copy], {
      stdio: "inherit",
    });
    execFileSync("hdiutil", ["detach", mounted], { stdio: "inherit" });
    mounted = undefined;
    executable = path.join(copy, "Contents/MacOS/RehabPredict");
  } else if (!executable) {
    executable = createRequire(import.meta.url)("electron");
    appArgument = path.resolve("dist/desktop/app");
    await fs.access(path.join(appArgument, "main.cjs"));
    await fs.access(path.join(appArgument, "package.json"));
  }
  executable = path.resolve(executable);
  const run = phase =>
    new Promise((resolve, reject) => {
      const report = path.join(temp, `${phase}.json`);
      const env = {
        ...process.env,
        REHAB_DATA_DIR: data,
        REHAB_SELF_TEST_PHASE: phase,
        REHAB_SELF_TEST_REPORT: report,
        DATABASE_URL: "mysql://not-used:invalid@127.0.0.1:1/not-used",
      };
      delete env.ELECTRON_RUN_AS_NODE;
      const args = [
        ...(appArgument ? [appArgument] : []),
        "--desktop-self-test",
      ];
      const child = spawn(executable, args, {
        cwd: temp,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      let logs = "";
      const collect = chunk => {
        logs = (logs + String(chunk)).slice(-30_000);
      };
      child.stdout.on("data", collect);
      child.stderr.on("data", collect);
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`Desktop self test timed out\n${logs}`));
      }, 120_000);
      child.on("error", error => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("exit", async (code, signal) => {
        clearTimeout(timer);
        try {
          if (code !== 0)
            throw new Error(
              `Desktop self test failed (${code}/${signal})\n${logs}`
            );
          const result = JSON.parse(await fs.readFile(report, "utf8"));
          if (!result.ok) throw new Error("Missing successful report");
          console.log(JSON.stringify(result));
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });
  await run("fresh");
  if (installer) {
    // Reinstall over the existing application, then verify that its user data survives.
    execFileSync(path.resolve(installer), ["/S", `/D=${installed}`], {
      stdio: "inherit",
      timeout: 180_000,
    });
  }
  await run("reopen");
  if (process.env.REHAB_DESKTOP_REPORT_DIR) {
    const dest = path.resolve(process.env.REHAB_DESKTOP_REPORT_DIR);
    await fs.mkdir(dest, { recursive: true });
    for (const name of ["fresh", "reopen"])
      await fs.copyFile(
        path.join(temp, `${name}.json`),
        path.join(dest, `${process.platform}-${process.arch}-${name}.json`)
      );
  }
  console.log(
    `Desktop installer/runtime test passed: ${process.platform}/${process.arch}; SQLite fresh database, saved results, backup/restore, relaunch retention`
  );
} finally {
  if (mounted)
    try {
      execFileSync("hdiutil", ["detach", mounted], { stdio: "ignore" });
    } catch {}
  if (installed) {
    const uninstaller = path.join(installed, "Uninstall RehabPredict.exe");
    try {
      execFileSync(uninstaller, ["/S"], { stdio: "inherit", timeout: 120_000 });
    } catch {}
  }
  await fs.rm(temp, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 500,
  });
}
