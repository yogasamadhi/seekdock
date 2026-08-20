import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Configuration } from "electron-builder";

const packageDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(packageDirectory, "../..");
const targetKey = `${process.platform}-${process.arch}`;

const config: Configuration = {
  appId: "io.seekdock.desktop",
  productName: "SeekDock",
  artifactName: "seekdock-${os}-${arch}.${ext}",
  asar: true,
  directories: {
    buildResources: "build",
    output: "release",
  },
  files: ["out/**/*", "package.json"],
  extraResources: [
    {
      from: resolve(repositoryRoot, ".runtime/stage", targetKey),
      to: "runtime",
      filter: ["**/*"],
    },
  ],
  extraMetadata: {
    main: "out/main/index.js",
  },
  mac: {
    category: "public.app-category.developer-tools",
    hardenedRuntime: true,
    identity: null,
    icon: "icon.icns",
    notarize: false,
    target: ["dmg", "zip"],
  },
  dmg: {
    sign: false,
  },
  win: {
    icon: "icon.ico",
    target: ["nsis"],
  },
  nsis: {
    oneClick: true,
    perMachine: false,
  },
};

export default config;
