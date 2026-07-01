const ecosystem = {
  apps: [
    {
      name: 'task-runner',
      script: './src/app.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        DB_HOST: 'REDACTED_DB_HOST',
        DB_USER: 'root',
        DB_PASSWORD: 'REDACTED_DB_PASSWORD',
        DB_NAME: 'comfaca_giro_real'
      },
      error_file: './logs/pm2-err.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      max_restarts: 5,
      min_uptime: '10s',
      restart_delay: 4000,
      kill_timeout: 5000,
      listen_timeout: 3000,
      // Configuración adicional
      autorestart: true,
      watch_delay: 1000,
      ignore_watch: [
        'node_modules',
        'logs',
        '*.log'
      ]
    }
  ]
};

module.exports = ecosystem;