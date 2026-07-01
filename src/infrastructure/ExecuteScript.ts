import moment, { Moment } from 'moment-timezone';
import cron from 'node-cron';
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import logger from '../../logger.js';
import TaskServices from '../services/TaskServices.js';
import type { Task, ExecuteResult } from '../types/Task.js';

const TIMEZONE: string = process.env.TIMEZONE || 'America/Bogota';
moment.tz.setDefault(TIMEZONE);

const scheduledTasks: Map<string, cron.ScheduledTask> = new Map();
void scheduledTasks; // Reservado para futuras tareas programadas con cron

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
    return new Promise((resolve, reject) => {
      let command: string;
      let args: string[];

      switch (task.script_type) {
        case 'python':
          command = 'python3';
          args = [task.script_path];
          break;
        case 'php':
          command = 'php';
          args = [task.script_path];
          break;
        default:
          reject(new Error(`Tipo de script no soportado: ${task.script_type}`));
          return;
      }

      if (task.parameters) {
        try {
          const params = JSON.parse(task.parameters) as string[];
          args.push(...params);
        } catch (parseError) {
          reject(new Error(`Parámetros JSON inválidos para tarea ${task.id}: ${(parseError as Error).message}`));
          return;
        }
      }

      logger.info(`Ejecutando: ${command} ${args.join(' ')} (Tarea ID: ${task.id})`);

      if (task.scheduled_at) {
        logger.info(`Tarea ${task.id} programada originalmente para: ${moment(task.scheduled_at).format('YYYY-MM-DD HH:mm:ss')}`);
      }

      if (task.cron_expression) {
        logger.info(`Tarea ${task.id} es recurrente con expresión cron: ${task.cron_expression}`);
      }

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
}

export default ExecuteScript;