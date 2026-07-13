import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Traces a minimal server bundle (only the node_modules actually used)
  // into .next/standalone, so the Docker runtime image doesn't need the
  // full node_modules tree - see app/Dockerfile.
  output: "standalone",
};

export default nextConfig;
