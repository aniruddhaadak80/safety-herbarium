/**
 * The build version, reported by the health endpoint and the MCP handshake so a
 * deployment can be identified from outside without reading a log.
 */
export function nextVersion(): string {
  return process.env.npm_package_version ?? "1.0.0";
}