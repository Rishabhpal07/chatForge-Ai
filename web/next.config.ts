import type { NextConfig } from "next";
import { join } from "node:path";

const nextConfig: NextConfig = {
  // Repo root (monorepo) so Turbopack picks the right workspace root + lockfile.
  turbopack: {
    root: join(__dirname, ".."),
  },
  // The shared package ships TypeScript source; let Next transpile it.
  transpilePackages: ["@chatforge/shared"],
};

export default nextConfig;
