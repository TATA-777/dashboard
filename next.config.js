/** @type {import('next').NextConfig} */
const nextConfig = {
  // react-leaflet이 개발모드 이중 렌더링(StrictMode)에서
  // "Map container is already initialized" 오류를 내는 걸 방지
  reactStrictMode: false,
};
module.exports = nextConfig;
