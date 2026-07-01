import { Worker } from 'node:worker_threads';
import path from 'node:path';
import logger from '../../logger.js';
import TaskServices from '../services/TaskServices.js';
import ExecuteScript from './ExecuteScript.js';
import type { Task, ExecuteResult } from '../types/Task.js';

const WORKER_SCRIPT_PATH = './TaskWorker.js';

class ProcessTasks {
  private runTaskInWorker(task: Task): Promise<boolean> {
    return new Promise((resolve) => {
      logger.info(`Ejecutando tarea en Worker: '${task.id}'.`);

      const worker = new Worker(path.resolve(__dirname, WORKER_SCRIPT_PATH), {
        workerData: task
      });

      worker.on('message', (result: ExecuteResult) => {
        if (result && result.success === true) {
          logger.info(`Resultado: OK Worker`);
          resolve(true);
        } else {
          logger.error(`Error en tarea ${task.id}:`, result.error);
          void worker.terminate();
          resolve(false);
        }
      });

      worker.on('error', (err: Error) => {
        logger.error(`Error en tarea ${task.id}:`, err);
        void worker.terminate();
        resolve(false);
      });

      worker.on('exit', (code: number) => {
        if (code !== 0) {
          logger.info(`Worker de ${task.id} detenido con código de salida ${code}`);
        }
        resolve(true);
      });
    });
  }

  private runTaskInChildProcess(task: Task): void {
    const taskServices = new TaskServices();
    const executeScript = new ExecuteScript();

    executeScript.execute(task).then(async (result: ExecuteResult) => {
      if (result.success) {
        await taskServices.updateTaskStatus(task.id, 'completed', result.output, null);
      } else {
        await taskServices.updateTaskStatus(task.id, 'failed', result.output, result.error);
      }
    });
  }

  async execute(): Promise<void> {
    try {
      const taskServices = new TaskServices();
      const tasks: Task[] = await taskServices.getPendingTasks();

      if (tasks.length === 0) {
        logger.info('No hay tareas pendientes');
        return;
      }

      logger.info(`Procesando ${tasks.length} tareas pendientes`);

      for (const task of tasks) {
        try {
          if (task.status === 'running') continue;
          if (task.cron_expression && task.cron_expression !== '') continue;

          await taskServices.updateTaskStatus(task.id, 'running');
          this.runTaskInChildProcess(task);
        } catch (error) {
          const err = error as Error;
          logger.error(`Error procesando tarea ${task.id}:`, err);
          await taskServices.updateTaskStatus(task.id, 'failed', null, err.message);
        }
      }
    } catch (error) {
      logger.error('Error en processTasks:', error);
    }
  }
}

export default (): ProcessTasks => {
  return new ProcessTasks();
};