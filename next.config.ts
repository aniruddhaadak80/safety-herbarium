import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * PGlite ships a WebAssembly binary and must be resolved from node_modules at
   * runtime, not bundled: bundling it rewrites how the `.wasm` asset is loaded and
   * the adapter fails at runtime with "instantiateWasm is not a function".
   *
   * This only matters for local verification, where the embedded adapter is the
   * zero-config store. Production uses the hosted Postgres adapter and never
   * imports this package.
   */
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;