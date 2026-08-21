import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { dshRoot } from "./constants.mjs";

const ENTRY_PACKAGE = "@deepseek-ai/dsh";

/**
 * Add required workspace peers that pnpm's legacy deploy cannot infer from
 * workspace: ranges, and remove deploy-time links from the packaged payload.
 */
export function materializeDshClosure(
  deploymentDirectory,
  sourceRoot = dshRoot,
) {
  const packages = indexWorkspacePackages(sourceRoot);
  const closure = resolveWorkspaceClosure(packages);
  const nodeModules = resolve(deploymentDirectory, "node_modules");

  for (const packageName of [...closure].sort()) {
    if (packageName === ENTRY_PACKAGE) continue;
    const source = packages.get(packageName)?.directory;
    if (!source)
      throw new Error(`DSH workspace package is missing: ${packageName}`);
    const destination = join(nodeModules, ...packageName.split("/"));
    if (existsSync(destination) && !lstatSync(destination).isSymbolicLink())
      continue;

    rmSync(destination, { recursive: true, force: true });
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination, {
      recursive: true,
      dereference: true,
      filter: (path) => {
        const segments = relative(source, path).split(sep);
        return !segments.includes("node_modules") && !segments.includes(".git");
      },
    });
  }

  removeBinDirectories(nodeModules);
  const remainingLink = findSymlink(nodeModules);
  if (remainingLink) {
    throw new Error(
      `DSH deployment still contains a symbolic link: ${remainingLink}`,
    );
  }

  console.log(`Materialized ${String(closure.size)} DSH workspace packages.`);
}

function indexWorkspacePackages(sourceRoot) {
  const result = new Map();
  const packageDirectories = [];

  collectChildren(join(sourceRoot, "apps"), packageDirectories);
  collectChildren(join(sourceRoot, "vendor"), packageDirectories);
  for (const group of readdirSync(join(sourceRoot, "packages"), {
    withFileTypes: true,
  })) {
    if (!group.isDirectory()) continue;
    collectChildren(
      join(sourceRoot, "packages", group.name),
      packageDirectories,
    );
  }
  packageDirectories.push(join(sourceRoot, "native/landlock-run"));
  collectChildren(
    join(sourceRoot, "native/landlock-run/packages"),
    packageDirectories,
  );

  for (const directory of packageDirectories) {
    const manifestPath = join(directory, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (typeof manifest.name === "string")
      result.set(manifest.name, { directory, manifest });
  }
  return result;
}

function collectChildren(parent, result) {
  if (!existsSync(parent)) return;
  for (const entry of readdirSync(parent, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    result.push(join(parent, entry.name));
  }
}

function resolveWorkspaceClosure(packages) {
  const closure = new Set();
  const queue = [ENTRY_PACKAGE];

  for (let index = 0; index < queue.length; index += 1) {
    const packageName = queue[index];
    if (!packageName || closure.has(packageName)) continue;
    const entry = packages.get(packageName);
    if (!entry)
      throw new Error(`Unable to index required DSH package ${packageName}`);
    closure.add(packageName);

    const manifest = entry.manifest;
    const dependencies = {
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
      ...Object.fromEntries(
        Object.entries(manifest.peerDependencies ?? {}).filter(
          ([peer]) => manifest.peerDependenciesMeta?.[peer]?.optional !== true,
        ),
      ),
    };

    for (const [dependency, range] of Object.entries(dependencies)) {
      if (packages.has(dependency)) {
        if (!closure.has(dependency)) queue.push(dependency);
      } else if (typeof range === "string" && range.startsWith("workspace:")) {
        throw new Error(
          `${packageName} requires unindexed workspace package ${dependency}`,
        );
      }
    }
  }
  return closure;
}

function removeBinDirectories(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const metadata = lstatSync(path);
    if (!metadata.isDirectory()) continue;
    if (name === ".bin") {
      rmSync(path, { recursive: true, force: true });
    } else {
      removeBinDirectories(path);
    }
  }
}

function findSymlink(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const metadata = lstatSync(path);
    if (metadata.isSymbolicLink()) return path;
    if (metadata.isDirectory()) {
      const nested = findSymlink(path);
      if (nested) return nested;
    }
  }
  return undefined;
}
