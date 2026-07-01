# Worker Process Node (PM2 Task Runner)

Servicio PM2 para ejecutar scripts programados de Python y PHP contra una base de datos MySQL.

## Stack

- Node.js 18+
- TypeScript 5
- PM2 5
- tsx (desarrollo)
- ts-node
- ESLint 9 + typescript-eslint
- pnpm

## Estructura del proyecto

```
.
├── ecosystem.config.cjs        # Configuración PM2 para producción
├── ecosystem.config.ts         # Configuración PM2 tipada (desarrollo)
├── eslint.config.mjs           # Configuración ESLint flat config
├── logger.ts                   # Logger Winston compartido
├── package.json
├── src
│   ├── app.ts                  # Punto de entrada (bucle infinito)
│   ├── database
│   │   └── dbConnection.ts     # Singleton del pool de MySQL
│   ├── infrastructure
│   │   ├── ExecuteScript.ts    # Ejecutor de scripts Python/PHP
│   │   ├── ProcessTasks.ts     # Orquestador de tareas pendientes
│   │   └── TaskWorker.ts       # Worker thread
│   ├── services
│   │   └── TaskServices.ts     # Operaciones sobre la tabla `tasks`
│   └── types
│       └── Task.ts             # Tipos compartidos
└── tsconfig.json
```

## Instalación

```bash
pnpm install
```

## Scripts disponibles

| Script              | Descripción                                                    |
| ------------------- | -------------------------------------------------------------- |
| `pnpm build`        | Compila TypeScript a `dist/`                                   |
| `pnpm start`        | Ejecuta el código compilado                                    |
| `pnpm dev`          | Modo desarrollo con `tsx watch`                                |
| `pnpm start:ts-node`| Arranque con `ts-node` (sin compilar)                          |
| `pnpm typecheck`    | Verifica tipos sin emitir archivos                             |
| `pnpm lint`         | Corre ESLint                                                   |
| `pnpm lint:fix`     | Corrige errores de ESLint automáticamente                      |
| `pnpm pm2:start`    | Inicia el servicio en PM2 usando el código compilado           |
| `pnpm pm2:stop`     | Detiene el servicio                                            |
| `pnpm pm2:restart`  | Reinicia el servicio                                           |
| `pnpm pm2:logs`     | Muestra logs en vivo                                           |
| `pnpm pm2:delete`   | Elimina el proceso de PM2                                      |

## Variables de entorno

Configurar `.env` o usar las variables definidas en `ecosystem.config.cjs`:

- `DB_HOST`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `TIMEZONE`
- `LOG_LEVEL`
- `NODE_ENV`

## Ejecución

### Desarrollo

```bash
pnpm dev
```

### Producción

```bash
pnpm build
pnpm pm2:start
```