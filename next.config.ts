import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  sassOptions: {
    // USWDS packages import each other by bare name from this directory.
    // Only this one path — adding node_modules/@uswds lets "uswds" resolve to
    // the package root and Sass reports a module loop.
    loadPaths: [path.join(process.cwd(), "node_modules/@uswds/uswds/packages")],
    silenceDeprecations: ["global-builtin", "import", "color-functions"],
    quietDeps: true,
  },
};

export default nextConfig;
