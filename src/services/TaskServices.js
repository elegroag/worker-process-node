const logger = require('../../logger.js');
const getDbPool = require('../database/dbConnection.js');
const moment = require('moment-timezone');
const TIMEZONE = process.env.TIMEZONE || 'America/Bogota';
moment.tz.setDefault(TIMEZONE);

class TaskServices {

    constructor() {
        this.pool = getDbPool();
    }

    // Obtener tareas pendientes de la base de datos (incluyendo programación)
    async getPendingTasks() {
        let connection;
        try {
            connection = await this.pool.getConnection();
            const currentDateTime = moment().format('YYYY-MM-DD HH:mm:ss');
            const [rows] = await connection.execute(`SELECT 
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
                limit 5
            `, [currentDateTime, currentDateTime]);

            logger.info(`Encontradas ${rows.length} tareas listas para ejecutar`);
            return rows;
        } catch (error) {
            logger.error('Error obteniendo tareas:', error);
            return [];
        } finally {
            if (connection) {
                connection.release(); // ¡IMPORTANTE! Asegura que la conexión se devuelve al pool
            }
        }
    }

    // Actualizar estado de tarea
    async updateTaskStatus(taskId, status, output = null, error = null) {
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
                connection.release(); // ¡IMPORTANTE! Asegura que la conexión se devuelve al pool
            }
        }
    }

    // Actualizar next de tarea
    async updateTaskNextRun(taskId, nextRunFormatted) {
        try {
            const connection = await this.pool.getConnection();
            await connection.execute(
                'UPDATE tasks SET next_run_at = ? WHERE id = ?',
                [nextRunFormatted, taskId]
            );
        } catch (error) {
            logger.error(`Error actualizando tarea ${taskId}:`, error);
        } finally {
            if (connection) {
                connection.release(); // ¡IMPORTANTE! Asegura que la conexión se devuelve al pool
            }
        }
    }


}

module.exports = TaskServices;