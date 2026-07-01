import { parentPort, workerData } from 'node:worker_threads';
import ExecuteScript from './ExecuteScript.js';
import TaskServices from '../services/TaskServices.js';
import logger from '../../logger.js';
import type { Task, ExecuteResult } from '../types/Task.js';

const task: Task = workerData as Task;

try {
  const executeScript = new ExecuteScript();
  const taskServices = new TaskServices();

  executeScript.execute(task).then(async (result: ExecuteResult) => {
    if (result.success) {
      await taskServices.updateTaskStatus(task.id, 'completed', result.output, null);
    } else {
      await taskServices.updateTaskStatus(task.id, 'failed', result.output, result.error);
    }
    parentPort?.postMessage(result);
  });
} catch (error) {
  const err = error as Error;
  logger.error(`[Worker - ${task.id}] Error al ejecutar la tarea:`, err);
  parentPort?.postMessage({ success: false, taskId: task.id, error: err.message });
}

parentPort?.on('error', (err: Error) => {
  logger.error(`[Worker - ${task.id}] Error capturado en el worker:`, err);
  process.exit(0);
});