import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https', 
        hostname: '**', // Allow any hostname
      },
      // You could potentially add an entry for 'http' if needed, but HTTPS is recommended
      // {
      //   protocol: 'http', 
      //   hostname: '**',
      // },
    ],
  },
  /* other config options here */
};

export default nextConfig;
