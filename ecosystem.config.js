module.exports = {
  apps: [
    {
      name: "zw-dashboard",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
      },
      // 크래시 시 자동 재시작, 짧은 시간에 반복 크래시하면 재시작 중단
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
    },
  ],
};
