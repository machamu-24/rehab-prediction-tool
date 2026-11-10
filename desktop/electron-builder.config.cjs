module.exports = {
  appId: "jp.machamu.rehabpredict",
  productName: "RehabPredict",
  directories: {
    app: "dist/desktop/app",
    output: "dist/installers",
    buildResources: "desktop/assets",
  },
  files: [
    "main.cjs",
    "self-test.cjs",
    "backend.mjs",
    "package.json",
    "release-manifest.json",
    "THIRD_PARTY_LICENSES.txt",
    "public/**",
    "release/literature.seed.json",
    "docs/**",
    "!node_modules/**",
  ],
  asar: true,
  afterPack: require("./after-pack.cjs"),
  npmRebuild: false,
  electronVersion: require("../package.json").devDependencies.electron.replace(
    /^[~^]/,
    ""
  ),
  icon: "desktop/assets/icon.png",
  electronFuses: {
    runAsNode: false,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
    grantFileProtocolExtraPrivileges: false,
  },
  publish: null,
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    artifactName: "RehabPredict-${version}-Windows-${arch}-Setup.${ext}",
    requestedExecutionLevel: "asInvoker",
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowElevation: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    runAfterFinish: false,
    deleteAppDataOnUninstall: false,
    installerLanguages: ["ja_JP", "en_US"],
    language: "1041",
  },
  mac: {
    target: ["dmg"],
    category: "public.app-category.medical",
    artifactName: "RehabPredict-${version}-macOS-${arch}.${ext}",
    identity: process.env.CSC_LINK ? undefined : "-",
    hardenedRuntime: Boolean(process.env.CSC_LINK),
    notarize: Boolean(
      process.env.CSC_LINK &&
        process.env.APPLE_ID &&
        process.env.APPLE_APP_SPECIFIC_PASSWORD &&
        process.env.APPLE_TEAM_ID
    ),
  },
  dmg: {
    title: "RehabPredict ${version}",
    contents: [
      { x: 150, y: 160, type: "file" },
      { x: 450, y: 160, type: "link", path: "/Applications" },
    ],
  },
  linux: { target: "dir", category: "Science" },
};
