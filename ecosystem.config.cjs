// PM2設定（サンドボックス/ノートPC単体デモ用）
// Docker Compose利用時は不要（docker compose up -d を使用）
module.exports = {
  apps: [
    {
      name: 'nursecall-api',
      script: 'src/index.js',
      cwd: '/home/user/webapp/server',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
        DATABASE_URL: 'postgresql://nursecall:nursecall_dev_2024@localhost:5432/nursecall',
        API_KEY: 'nursecall_api_key_dev',
        JWT_SECRET: 'nursecall_jwt_secret_dev_2024',
        TZ: 'Asia/Tokyo',
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
    },
  ],
};
