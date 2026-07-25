import { access, cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

// Packages Sites metadata and migrations after Vite finishes compiling.
export function sites(): Plugin {
  let root = process.cwd();
  let packagingPromise: Promise<void> | undefined;

  return {
    name: "sites",
    apply: "build",
    configResolved(config) {
      root = config.root;
    },
    closeBundle() {
      // vinext builds multiple Vite environments. They can invoke closeBundle
      // concurrently, so package the shared Sites output exactly once per build.
      packagingPromise ??= (async () => {
        const outputDirectory = resolve(root, "dist", ".openai");
        const hostingConfig = resolve(root, ".openai", "hosting.json");
        const drizzleSource = resolve(root, "drizzle");

        await rm(outputDirectory, { recursive: true, force: true });
        await mkdir(outputDirectory, { recursive: true });

        if (await exists(hostingConfig)) {
          await cp(hostingConfig, resolve(outputDirectory, "hosting.json"));
        }
        if (await exists(drizzleSource)) {
          await cp(drizzleSource, resolve(outputDirectory, "drizzle"), {
            recursive: true,
          });
        }
      })();

      return packagingPromise;
    },
  };
}
