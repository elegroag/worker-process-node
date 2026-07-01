# Flujo del proceso

Documentación técnica del ciclo de vida del servicio `task-runner`: desde que PM2 lo levanta, hasta cómo consulta la base de datos, ejecuta scripts externos y actualiza el estado de cada tarea.

---

## 1. Vista general

```
                                  ┌──────────────────────────────────────┐
                                  │              PM2 daemon              │
                                  │  (modo fork, 1 instancia, autorestart)│
                                  └──────────────────┬───────────────────┘
                                                     │ spawn + watch
                                                     ▼
                          ┌────────────────────────────────────────────────────┐
                          │            src/app.ts  (bucle infinito)            │
                          │  • Carga .env                                     │
                          │  • Inicializa el pool MySQL (Singleton)            │
                          │  • Registra handlers SIGINT / SIGTERM             │
                          └────────────────────────┬───────────────────────────┘
                                                   │ cada 2 minutos
                                                   ▼
                       ┌──────────────────────────────────────────────────────┐
                       │       src/infrastructure/ProcessTasks.ts              │
                       │   1. Pide tareas pendientes (TaskServices)            │
                       │   2. Filtra (status running, con cron)               │
                       │   3. Marca cada tarea como 'running'                 │
                       │   4. Dispara la ejecución                            │
                       └────────────────────────┬─────────────────────────────┘
                                                │
                  ┌─────────────────────────────┴─────────────────────────────┐
                  ▼                                                           ▼
   ┌──────────────────────────────┐                        ┌──────────────────────────────────┐
   │  runTaskInChildProcess(task) │                        │ runTaskInWorker(task)  [opcional] │
   │  (flujo activo del proyecto) │                        │  Worker thread + TaskWorker.ts   │
   └──────────────┬───────────────┘                        └────────────────┬─────────────────┘
                  │                                                         │
                  ▼                                                         ▼
   ┌──────────────────────────────┐                        ┌──────────────────────────────────┐
   │   ExecuteScript.execute()    │                        │     TaskWorker.ts (hilo aparte)  │
   │   • spawn(command, args)     │                        │   ExecuteScript.execute()        │
   │   • stdio: pipe, detached    │                        │   postMessage(result)            │
   │   • captura stdout / stderr  │                        └──────────────────────────────────┘
   └──────────────┬───────────────┘
                  │ close(code)
                  ▼
   ┌──────────────────────────────┐
   │   updateTaskStatus(id, ...)  │ ─────►  MySQL  tabla `tasks`
   │   completed / failed         │
   │   con output + error         │
   └──────────────────────────────┘
```

> **Nota**: en el código actual la rama activa es `runTaskInChildProcess` (process detachment). `runTaskInWorker` permanece disponible pero comentada en su llamada desde `ProcessTasks.execute()`.

---

## 2. Arranque en frío

1. **PM2** lee `ecosystem.config.cjs` y lanza `node dist/src/app.js`.
2. `src/app.ts` ejecuta `dotenv.config()` para cargar variables del `.env`.
3. La primera importación transitiva de `./database/dbConnection.js` dispara el constructor de `Database`, que crea el **Singleton** del pool MySQL con `mysql2/promise.createPool()` (10 conexiones máximo, `connectTimeout: 10s`).
4. Se intenta una conexión inicial de prueba (`getConnection().release()`) sólo para validar — no bloquea el arranque si falla.
5. La constante `isRunning = true` habilita el bucle principal.
6. Se registran listeners para señales:
   - `SIGINT`, `SIGTERM` → ponen `isRunning = false`, esperan 5s para drenar el ciclo, cierran el pool y salen con código 0.
   - `uncaughtException`, `unhandledRejection` → log y salida con código 1.

---

## 3. Bucle principal (`src/app.ts → main()`)

```ts
while (isRunning) {
  currentCycle++;
  if (currentCycle % 100 === 0) logger.info(`Ciclo ${currentCycle}`);
  await processTasks.execute();        // puede ser vacío
  await sleep(120_000);                // 2 minutos
}
```

- Cada iteración invoca `ProcessTasks.execute()`.
- Si el ciclo falla, espera **3 minutos** en lugar de 2 antes de reintentar (`catch` actual).
- El log con marca `Ciclo N - Servicio funcionando correctamente` aparece cada 100 ciclos para evidenciar que sigue vivo.

---

## 4. Procesamiento por ciclo (`ProcessTasks.execute()`)

### 4.1 Lectura de tareas

`TaskServices.getPendingTasks()` ejecuta la siguiente SQL:

```sql
SELECT id, script_type, script_path, parameters, status, scheduled_at,
       cron_expression, timezone, priority, created_at, updated_at
FROM tasks
WHERE status IN ('pending', 'running')
  AND (scheduled_at IS NULL OR scheduled_at <= ?)
  AND (cron_expression IS NULL
       OR (cron_expression IS NOT NULL AND next_run_at <= ?))
ORDER BY priority DESC, scheduled_at ASC, created_at ASC
LIMIT 5
```

Devuelve hasta **5** tareas por ciclo, filtradas por horario y cola cron, ordenadas por prioridad.

### 4.2 Filtros en código

Para cada tarea recuperada se descartan:

| Condición                                | Acción                       |
| ---------------------------------------- | ---------------------------- |
| `task.status === 'running'`              | `continue` (ya en proceso)   |
| `task.cron_expression` no vacío          | `continue` (las gestiona el helper de cron, no el bucle actual) |
| Error al marcarla como `running`         | `updateTaskStatus(id, 'failed', err.message)` |

### 4.3 Despacho

Si pasa los filtros, se marca como `running` y se invoca `runTaskInChildProcess(task)`. La ejecución es **fire-and-forget**: no se espera su resultado desde el bucle, lo que permite lanzar varias tareas en paralelo dentro del ciclo.

---

## 5. Ejecución del script (`ExecuteScript.execute()`)

### 5.1 Selección del intérprete

```ts
case 'python' → command = 'python3', args = [script_path]
case 'php'    → command = 'php',     args = [script_path]
default       → reject (tipo no soportado)
```

`task.parameters` (JSON string) se parsea y se concatena a `args`. Si el JSON es inválido, se rechaza la promesa.

### 5.2 Lanzamiento

```ts
spawn(command, args, {
  stdio: ['pipe', 'pipe', 'pipe'],
  detached: true
});
```

- `detached: true` + `process.unref()` ⇒ el script sobrevive al cierre del proceso padre (similar a `nohup`).
- `stdio` con pipes permite capturar salida.

### 5.3 Eventos del proceso hijo

| Evento              | Acción                                                                                |
| ------------------- | ------------------------------------------------------------------------------------- |
| `stdout.on('data')` | acumula, loguea `STDOUT` por líneas                                                   |
| `stderr.on('data')` | acumula, loguea `STDERR` como error                                                   |
| `close(code)`       | resuelve `{ success: code === 0, output, error }`                                     |
| `error`             | rechaza la promesa con el error original                                              |

### 5.4 Cierre del ciclo de la tarea

Cuando la promesa se resuelve, `runTaskInChildProcess` actualiza MySQL:

```ts
if (result.success) updateTaskStatus(id, 'completed', output, null);
else                updateTaskStatus(id, 'failed',    output, error);
```

`TaskServices.updateTaskStatus` ejecuta:

```sql
UPDATE tasks
SET status = ?, output = ?, error = ?, updated_at = ?
WHERE id = ?
```

---

## 6. Cálculo de próxima ejecución para tareas con cron

`ExecuteScript.calculateNextRun(taskId, cronExpression, timezone)` está implementado pero **no se llama** desde el flujo activo (las tareas con `cron_expression` se excluyen en `ProcessTasks.execute`). Mantiene viva la integración con `node-cron`:

1. Valida la expresión con `cron.validate()`.
2. Recorre minuto a minuto (máx. 1000 intentos) hasta que la fecha coincide con `matchesCronExpression`.
3. Persiste `next_run_at` vía `TaskServices.updateTaskNextRun`.

---

## 7. Manejo de errores y logging

- Todos los errores se registran a través de **Winston** (`logger.ts`):
  - `logs/error.log` (nivel `error`).
  - `logs/combined.log` (todos los niveles).
  - Consola con formato colorizado.
- PM2 añade además `logs/pm2-{err,out,combined}.log` a través del `ecosystem.config.cjs`.
- Excepciones no capturadas fuerzan `process.exit(1)`, momento en el que PM2 decide reiniciar (hasta `max_restarts: 5`, con `restart_delay: 4s` y `min_uptime: 10s`).

---

## 8. Ciclo de vida de una tarea (diagrama de estados)

```
                ┌─────────────┐
                │  (en MySQL) │
                └──────┬──────┘
                       │ INSERT (status='pending')
                       ▼
            ┌──────────────────┐
            │     pending      │ ◄────────────────┐
            └────────┬─────────┘                  │
                     │ getPendingTasks() lo trae  │
                     ▼                            │
            ┌──────────────────┐                  │
            │     running      │                  │
            └────────┬─────────┘                  │
        ┌────────────┴────────────┐               │
        ▼                         ▼               │
 ┌─────────────┐            ┌─────────────┐       │
 │  completed  │            │   failed    │───────┘ (no reintento automático hoy)
 └─────────────┘            └─────────────┘
```

> Si se requiere reintentos se debe volver el registro a `pending` desde una capa externa (no implementada en este servicio).

---

## 9. Configuración operativa clave

| Variable       | Origen                                | Uso                                       |
| -------------- | ------------------------------------- | ----------------------------------------- |
| `DB_HOST`      | `.env` / `ecosystem.config.cjs`       | Host del MySQL                            |
| `DB_USER`      | `.env` / `ecosystem.config.cjs`       | Usuario                                   |
| `DB_PASSWORD`  | `.env` / `ecosystem.config.cjs`       | Password                                  |
| `DB_NAME`      | `.env` / `ecosystem.config.cjs`       | Schema                                    |
| `TIMEZONE`     | `.env`                                | Default `America/Bogota` para moment-timezone |
| `LOG_LEVEL`    | `.env`                                | Nivel Winston                             |
| `NODE_ENV`     | `ecosystem.config.cjs`                | PM2 fija `production`                     |

---

## 10. Resumen del flujo en una pasada

1. **PM2 → app.ts**: arranque, carga del entorno, pool MySQL singleton, handlers de señales.
2. **Bucle cada 2 min**: incrementa `currentCycle`, llama `ProcessTasks.execute()`.
3. **ProcessTasks**: lee hasta 5 tareas pendientes, salta `running` y con cron, marca el resto como `running`.
4. **ExecuteScript**: hace `spawn` del intérprete (`python3` o `php`) con `detached: true`, captura stdout/stderr, resuelve la promesa al `close`.
5. **TaskServices**: actualiza la fila a `completed` o `failed` con `output`/`error`/`updated_at`.
6. **Logger**: persiste todo en `logs/` y consola con timestamp.
7. **Cierre ordenado**: `SIGINT`/`SIGTERM` ⇒ `isRunning = false` ⇒ drenado (5s) ⇒ `pool.end()` ⇒ `exit(0)`.

Este bucle se mantiene indefinidamente mientras PM2 conserve el proceso vivo, reiniciándolo ante crash hasta 5 veces seguidas.
