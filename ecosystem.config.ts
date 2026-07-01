// Configuración de PM2 con `tsx` interpreter (modo desarrollo).
//
// IMPORTANTE: este archivo NUNCA debe contener credenciales. Las variables
// de entorno se cargan desde `.env` (excluido del repositorio) usando
// `dotenv -e .env -- pm2 start ecosystem.config.ts` desde los scripts npm.

interface AppConfig {
  name: string;
  script: string;
  instances: number;
  exec_mode: string;
  watch: boolean;
  max_memory_restart: string;
  env: Record<string, string>;
  error_file: string;
  out_file: string;
  log_file: string;
  time: boolean;
  log_date_format: string;
  merge_logs: boolean;
  max_restarts: number;
  min_uptime: string;
  restart_delay: number;
  kill_timeout: number;
  listen_timeout: number;
  autorestart: boolean;
  watch_delay: number;
  ignore_watch: string[];
  interpreter?: string;
}

interface EcosystemConfig {
  apps: AppConfig[];
}

const ecosystem: EcosystemConfig = {
  apps: [
    {
      name: 'task-runner',
      script: './src/app.ts',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      interpreter: 'tsx',
      env: {
        NODE_ENV: process.env.NODE_ENV || 'production',
        DB_HOST: process.env.DB_HOST || '',
        DB_USER: process.env.DB_USER || '',
        DB_PASSWORD: process.env.DB_PASSWORD || '',
        DB_NAME: process.env.DB_NAME || ''
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

export default ecosystem;