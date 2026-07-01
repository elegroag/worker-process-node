import moment, { Moment } from 'moment-timezone';
import cron from 'node-cron';
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import logger from '../../logger.js';
import TaskServices from '../services/TaskServices.js';
import type { Task, ExecuteResult } from '../types/Task.js';

const TIMEZONE: string = process.env.TIMEZONE || 'America/Bogota';
moment.tz.setDefault(TIMEZONE);

const scheduledTasks: Map<string, cron.ScheduledTask> = new Map();
void scheduledTasks; // Reservado para futuras tareas programadas con cron

type ExecutionStrategy =
  | { kind: 'spawn'; command: string; args: string[] }
  | { kind: 'http'; url: string; body: unknown };


class ExecuteScript {
  private taskServices: TaskServices;

  constructor() {
    this.taskServices = new TaskServices();
  }

  async calculateNextRun(
    taskId: number,
    cronExpression: string,
    timezone: string | null = null
  ): Promise<string | null> {
    try {
      const taskTimezone = timezone || TIMEZONE;

      if (!cron.validate(cronExpression)) {
        logger.error(`Expresión cron inválida para tarea ${taskId}: ${cronExpression}`);
        return null;
      }

      const nextRun: Moment = moment().tz(taskTimezone).add(1, 'minute');

      const testDate: Moment = moment(nextRun);
      let attempts = 0;
      const maxAttempts = 1000;

      while (attempts < maxAttempts) {
        if (cron.validate(cronExpression)) {
          if (this.matchesCronExpression(testDate, cronExpression)) {
            const nextRunFormatted = testDate.format('YYYY-MM-DD HH:mm:ss');
            await this.taskServices.updateTaskNextRun(taskId, nextRunFormatted);

            logger.info(`Próxima ejecución para tarea ${taskId}: ${nextRunFormatted}`);
            return nextRunFormatted;
          }

          testDate.add(1, 'minute');
          attempts++;
        } else {
          break;
        }
      }

      return null;
    } catch (error) {
      logger.error(`Error calculando próxima ejecución para tarea ${taskId}:`, error);
      return null;
    }
  }

  private matchesCronExpression(date: Moment, cronExpression: string): boolean {
    const parts = cronExpression.split(' ');
    if (parts.length !== 5) return false;

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    if (minute !== '*' && minute !== date.minute().toString()) return false;
    if (hour !== '*' && hour !== date.hour().toString()) return false;
    if (dayOfMonth !== '*' && dayOfMonth !== date.date().toString()) return false;
    if (month !== '*' && month !== (date.month() + 1).toString()) return false;
    if (dayOfWeek !== '*' && dayOfWeek !== date.day().toString()) return false;

    return true;
  }

  execute(task: Task): Promise<ExecuteResult> {
    let strategy: ExecutionStrategy;
    try {
      strategy = this.resolveExecutionStrategy(task);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }

    if (task.scheduled_at) {
      logger.info(`Tarea ${task.id} programada originalmente para: ${moment(task.scheduled_at).format('YYYY-MM-DD HH:mm:ss')}`);
    }

    if (task.cron_expression) {
      logger.info(`Tarea ${task.id} es recurrente con expresión cron: ${task.cron_expression}`);
    }

    return strategy.kind === 'spawn'
      ? this.executeViaSpawn(task, strategy.command, strategy.args)
      : this.executeViaHttp(task, strategy.url, strategy.body);
  }

  private resolveExecutionStrategy(task: Task): ExecutionStrategy {
    switch (task.script_type) {
      case 'python':
        return {
          kind: 'spawn',
          command: 'python3',
          args: this.buildSpawnArgs(task, [task.script_path])
        };
      case 'php':
        return {
          kind: 'spawn',
          command: 'php',
          args: this.buildSpawnArgs(task, [task.script_path])
        };
      case 'api':
        return {
          kind: 'http',
          url: task.script_path,
          body: this.buildHttpBody(task)
        };
      default: {
        const exhaustive: never = task.script_type;
        throw new Error(`Tipo de script no soportado: ${exhaustive}`);
      }
    }
  }

  private buildSpawnArgs(task: Task, baseArgs: string[]): string[] {
    const args = [...baseArgs];
    if (task.parameters) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(task.parameters);
      } catch (parseError) {
        throw new Error(
          `Parámetros JSON inválidos para tarea ${task.id}: ${(parseError as Error).message}`
        );
      }

      if (!Array.isArray(parsed) || !parsed.every((p) => typeof p === 'string')) {
        throw new Error(`Parámetros de tarea ${task.id} deben ser un array de strings`);
      }
      args.push(...(parsed as string[]));
    }
    return args;
  }

  private buildHttpBody(task: Task): unknown {
    if (!task.parameters) return {};
    try {
      return JSON.parse(task.parameters);
    } catch (parseError) {
      throw new Error(
        `Parámetros JSON inválidos para tarea ${task.id}: ${(parseError as Error).message}`
      );
    }
  }

  private executeViaSpawn(task: Task, command: string, args: string[]): Promise<ExecuteResult> {
    return new Promise((resolve, reject) => {
      logger.info(`Ejecutando: ${command} ${args.join(' ')} (Tarea ID: ${task.id})`);

      const childProcess: ChildProcessWithoutNullStreams = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: true
      });

      let stdout = '';
      let stderr = '';

      childProcess.stdout.on('data', (data: Buffer) => {
        const output = data.toString();
        stdout += output;
        logger.info(`[${task.id}] STDOUT: ${output.trim()}`);
      });

      childProcess.stderr.on('data', (data: Buffer) => {
        const error = data.toString();
        stderr += error;
        logger.error(`[${task.id}] STDERR: ${error.trim()}`);
      });

      childProcess.on('close', (code: number | null) => {
        logger.info(`Proceso ${task.id} terminado con código: ${code}`);

        if (code === 0) {
          resolve({ success: true, output: stdout, error: null });
        } else {
          resolve({ success: false, output: stdout, error: stderr });
        }
      });

      childProcess.on('error', (error: Error) => {
        logger.error(`Error ejecutando tarea ${task.id}:`, error);
        reject(error);
      });

      childProcess.unref();
    });
  }

  private executeViaHttp(task: Task, url: string, body: unknown): Promise<ExecuteResult> {
    logger.info(`Ejecutando vía API: POST ${url} (Tarea ID: ${task.id})`);

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return Promise.reject(new Error(`URL inválida para tarea ${task.id}: ${url}`));
    }

    const isHttps = parsedUrl.protocol === 'https:';
    const lib = isHttps ? https : http;

    const payload = JSON.stringify(body ?? {});
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload).toString()
    };

    return new Promise((resolve, reject) => {
      const req = lib.request(
        {
          method: 'POST',
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (isHttps ? 443 : 80),
          path: `${parsedUrl.pathname}${parsedUrl.search}`,
          headers
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));

          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf-8');
            const status = res.statusCode ?? 0;
            logger.info(`[${task.id}] HTTP ${status} - ${raw.slice(0, 500)}`);

            if (status >= 200 && status < 300) {
              resolve({ success: true, output: raw, error: null });
            } else {
              resolve({ success: false, output: raw, error: `HTTP ${status}` });
            }
          });
        }
      );

      req.on('error', (error: Error) => {
        logger.error(`Error ejecutando tarea ${task.id} vía API:`, error);
        reject(error);
      });

      req.setTimeout(60_000, () => {
        req.destroy(new Error(`Timeout ejecutando tarea ${task.id} vía API`));
      });

      req.write(payload);
      req.end();
    });
  }
}

export default ExecuteScript;