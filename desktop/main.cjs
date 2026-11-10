const {
  app,
  BrowserWindow,
  Menu,
  shell,
  dialog,
  session,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { randomBytes } = require("node:crypto");
const { pathToFileURL } = require("node:url");

app.setName("RehabPredict");
// Data lives outside the application/install directory and survives reinstall/update.
const dataDirectory =
  process.env.REHAB_DATA_DIR ||
  (process.platform === "win32"
    ? path.join(
        process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData/Local"),
        "RehabPredict"
      )
    : process.platform === "darwin"
      ? path.join(os.homedir(), "Library/Application Support/RehabPredict")
      : path.join(os.homedir(), ".local/share/RehabPredict"));
app.setPath("userData", path.resolve(dataDirectory));
const selfTest = process.argv.includes("--desktop-self-test");
if (selfTest) {
  const relative = path.relative(os.tmpdir(), path.resolve(dataDirectory));
  if (
    !process.env.REHAB_DATA_DIR ||
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    !relative.split(path.sep)[0].startsWith("rehab-desktop-test-")
  ) {
    console.error("Self test requires an isolated temporary REHAB_DATA_DIR");
    app.exit(1);
  }
}
let backend;
let window;
let closing = false;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      const resources = __dirname;
      process.env.REHAB_DATA_DIR = app.getPath("userData");
      process.env.REHAB_SEED_PATH = path.join(
        resources,
        "release/literature.seed.json"
      );
      process.env.REHAB_DESKTOP = "1";
      process.env.NODE_ENV = "production";
      // Desktop operation never depends on a developer's MySQL/OAuth environment.
      process.env.DATABASE_URL = "";
      process.env.OAUTH_SERVER_URL = "";
      process.env.BUILT_IN_FORGE_API_URL = "";
      process.env.BUILT_IN_FORGE_API_KEY = "";
      const token = randomBytes(32).toString("hex");
      const { startLocalServer } = await import(
        pathToFileURL(path.join(resources, "backend.mjs")).href
      );
      backend = await startLocalServer({
        port: 0,
        host: "127.0.0.1",
        publicDir: path.join(resources, "public"),
        token,
      });
      const base = backend.url;
      const safeWebURL = url => {
        try {
          const u = new URL(url);
          return ["https:", "http:"].includes(u.protocol);
        } catch {
          return false;
        }
      };
      const openExternal = url => {
        if (safeWebURL(url)) shell.openExternal(url).catch(() => {});
      };
      const isolated = session.fromPartition("persist:rehab-desktop");
      isolated.setPermissionRequestHandler(
        (_webContents, _permission, callback) => callback(false)
      );
      isolated.setPermissionCheckHandler(() => false);
      isolated.webRequest.onBeforeSendHeaders(
        { urls: [`${base}/*`] },
        (details, callback) =>
          callback({
            requestHeaders: {
              ...details.requestHeaders,
              "X-Rehab-Token": token,
            },
          })
      );
      isolated.webRequest.onHeadersReceived(
        { urls: [`${base}/*`] },
        (details, callback) =>
          callback({
            responseHeaders: {
              ...details.responseHeaders,
              "Content-Security-Policy": [
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'",
              ],
            },
          })
      );
      window = new BrowserWindow({
        width: 1320,
        height: 900,
        minWidth: 900,
        minHeight: 640,
        show: false,
        title: "RehabPredict",
        backgroundColor: "#f5faf5",
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
          session: isolated,
        },
      });
      window.webContents.setWindowOpenHandler(({ url }) => {
        openExternal(url);
        return { action: "deny" };
      });
      window.webContents.on("will-navigate", (event, url) => {
        if (new URL(url).origin !== base) {
          event.preventDefault();
          openExternal(url);
        }
      });
      window.webContents.on("will-attach-webview", event =>
        event.preventDefault()
      );
      window.on("closed", () => {
        window = null;
      });
      isolated.on("will-download", (_event, item) => {
        if (!selfTest)
          item.setSaveDialogOptions({
            title: "ファイルを保存",
            defaultPath: path.join(
              app.getPath("downloads"),
              item.getFilename()
            ),
          });
      });
      const menu = [
        ...(process.platform === "darwin"
          ? [
              {
                label: "RehabPredict",
                submenu: [
                  { role: "about" },
                  { type: "separator" },
                  { role: "hide" },
                  { role: "hideOthers" },
                  { role: "unhide" },
                  { type: "separator" },
                  { role: "quit", label: "RehabPredictを終了" },
                ],
              },
            ]
          : []),
        {
          label: "ファイル",
          submenu: [
            {
              label: "データ保存先を開く",
              click: () => shell.openPath(app.getPath("userData")),
            },
            {
              label: "バックアップ画面を開く",
              click: () => window?.loadURL(`${base}/local`),
            },
            { type: "separator" },
            { role: "quit", label: "終了" },
          ],
        },
        {
          label: "編集",
          submenu: [
            { role: "undo", label: "取り消す" },
            { role: "redo", label: "やり直す" },
            { type: "separator" },
            { role: "cut", label: "切り取り" },
            { role: "copy", label: "コピー" },
            { role: "paste", label: "貼り付け" },
            { role: "selectAll", label: "すべて選択" },
          ],
        },
        {
          label: "表示",
          submenu: [
            { role: "resetZoom", label: "標準の表示倍率" },
            { role: "zoomIn", label: "拡大" },
            { role: "zoomOut", label: "縮小" },
            { role: "togglefullscreen", label: "全画面表示" },
          ],
        },
        {
          label: "ヘルプ",
          submenu: [
            {
              label: "使い方",
              click: () =>
                openExternal(
                  "https://github.com/machamu-24/rehab-prediction-tool/blob/main/docs/RELEASE_GUIDE.md"
                ),
            },
          ],
        },
      ];
      Menu.setApplicationMenu(Menu.buildFromTemplate(menu));
      await window.loadURL(base);
      if (selfTest) {
        const { runDesktopSelfTest } = require("./self-test.cjs");
        const result = await runDesktopSelfTest({
          app,
          window,
          base,
          token,
          resources,
        });
        const report = process.env.REHAB_SELF_TEST_REPORT;
        if (report) {
          fs.mkdirSync(path.dirname(report), { recursive: true });
          fs.writeFileSync(report, JSON.stringify(result, null, 2));
        }
        console.log("DESKTOP_SELF_TEST_OK", JSON.stringify(result));
        app.quit();
      } else window.show();
    })
    .catch(async error => {
      if (selfTest) {
        console.error(error);
        app.exit(1);
        return;
      }
      dialog.showErrorBox(
        "RehabPredictを起動できませんでした",
        `${error instanceof Error ? error.message : "データを開けませんでした。"}\n\nアプリの再インストールでは保存データは削除されません。データ保存先の空き容量・権限を確認してください。`
      );
      app.quit();
    });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", event => {
    if (closing || !backend) return;
    event.preventDefault();
    closing = true;
    backend.close().then(
      () => app.exit(0),
      () => app.exit(1)
    );
  });
}
