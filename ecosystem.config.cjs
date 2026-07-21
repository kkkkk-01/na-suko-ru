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
      // --- 落ちにくさ強化 ---
      autorestart: true,          // クラッシュ時に自動再起動
      max_memory_restart: '300M', // メモリリーク時のセーフティ（通常80MB前後）
      min_uptime: '10s',          // 10秒未満での連続クラッシュを異常と判定
      max_restarts: 50,           // 異常クラッシュループの上限
      restart_delay: 2000,        // 再起動間隔2秒（DB復帰待ちの猶予）
    },
  ],
};
