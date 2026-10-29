import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The signed-in app moved under /app; links in old emails and bookmarks still work.
  async redirects() {
    return ["courses", "admin", "account", "help", "submissions"].flatMap((p) => [
      { source: `/${p}`, destination: `/app/${p}`, permanent: true },
      { source: `/${p}/:path*`, destination: `/app/${p}/:path*`, permanent: true },
    ]);
  },
};

export default nextConfig;
