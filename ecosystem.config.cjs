// Configuración de PM2 para producción (apunta al código compilado).
// Se usa extensión .cjs porque PM2 carga este archivo como CommonJS clásico.
//
// IMPORTANTE: este archivo NUNCA debe contener credenciales. Las variables
// de entorno se cargan desde el archivo `.env` (que está en .gitignore) por
// `dotenv-cli` en el script `pnpm pm2:start` del package.json.
module.exports = {
  apps: [
    {
      name: 'task-runner',
      script: './dist/src/app.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      // Las credenciales se inyectan desde el entorno (cargadas con dotenv).
      env: {
        NODE_ENV: 'production'
        // DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, TIMEZONE, LOG_LEVEL
        // se leen del proceso; aquí no se setean ni se exponen.
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
      autorestart: true,
      watch_delay: 1000,
      ignore_watch: [
        'node_modules',
        'dist',
        'logs',
        '*.log'
      ]
    }
  ]
};