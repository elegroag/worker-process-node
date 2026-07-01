import moment from 'moment-timezone';
import logger from '../../logger.js';
import { getDbPool } from '../database/dbConnection.js';
import type { Pool } from 'mysql2/promise';
import type { Task, TaskStatus } from '../types/Task.js';

const TIMEZONE: string = process.env.TIMEZONE || 'America/Bogota';
moment.tz.setDefault(TIMEZONE);

class TaskServices {
  private pool: Pool;

  constructor() {
    this.pool = getDbPool();
  }

  async getPendingTasks(): Promise<Task[]> {
    let connection;
    try {
      connection = await this.pool.getConnection();
      const currentDateTime = moment().format('YYYY-MM-DD HH:mm:ss');
      const [rows] = await connection.execute(
        `SELECT
          id,
          script_type,
          script_path,
          parameters,
          status,
          scheduled_at,
          cron_expression,
          timezone,
          priority,
          created_at,
          updated_at
        FROM tasks
        WHERE status IN("pending", "running")
        AND (scheduled_at IS NULL OR scheduled_at <= ?)
        AND (cron_expression IS NULL OR  (cron_expression IS NOT NULL AND next_run_at <= ?))
        ORDER BY
          priority DESC,
          scheduled_at ASC,
          created_at ASC
        limit 5`,
        [currentDateTime, currentDateTime]
      );

      const tasks = rows as Task[];
      logger.info(`Encontradas ${tasks.length} tareas listas para ejecutar`);
      return tasks;
    } catch (error) {
      logger.error('Error obteniendo tareas:', error);
      return [];
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }

  async updateTaskStatus(
    taskId: number,
    status: TaskStatus,
    output: string | null = null,
    error: string | null = null
  ): Promise<void> {
    let connection;
    try {
      connection = await this.pool.getConnection();

      const updateTime = moment().format('YYYY-MM-DD HH:mm:ss');
      await connection.execute(
        'UPDATE tasks SET status = ?, output = ?, error = ?, updated_at = ? WHERE id = ?',
        [status, output, error, updateTime, taskId]
      );

      logger.info(`Tarea ${taskId} actualizada a estado: ${status} a las ${updateTime}`);
    } catch (error) {
      logger.error(`Error actualizando tarea ${taskId}:`, error);
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }

  async updateTaskNextRun(taskId: number, nextRunFormatted: string): Promise<void> {
    let connection;
    try {
      connection = await this.pool.getConnection();
      await connection.execute(
        'UPDATE tasks SET next_run_at = ? WHERE id = ?',
        [nextRunFormatted, taskId]
      );
    } catch (error) {
      logger.error(`Error actualizando tarea ${taskId}:`, error);
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }
}

export default TaskServices;