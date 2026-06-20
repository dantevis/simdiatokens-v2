import type { NextConfig } from "next";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://baloncloud.eu";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
