/** @type {import('next').NextConfig} */
// The product catalog and shopper questions are read from data/*.csv at runtime, so ship them with every function.
const nextConfig = {
  outputFileTracingIncludes: { "/**": ["./data/**/*.csv"] },
};
export default nextConfig;
