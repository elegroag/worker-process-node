const moment = require('moment-timezone');
const cron = require('node-cron');
const { spawn } = require('node:child_process');
const logger = require('../../logger.js');
const TaskServices = require('../services/TaskServices.js');

// Configuración de zona horaria (configurable)
const TIMEZONE = process.env.TIMEZONE || 'America/Bogota';
moment.tz.setDefault(TIMEZONE);
let scheduledTasks = new Map(); // Para almacenar tareas programadas con cron

class ExecuteScript {

    constructor() {
        this.taskServices = new TaskServices();
    }

    // Calcular próxima ejecución para tareas con cron
    async calculateNextRun(taskId, cronExpression, timezone = null) {
        try {
            const taskTimezone = timezone || TIMEZONE;

            if (!cron.validate(cronExpression)) {
                logger.error(`Expresión cron inválida para tarea ${taskId}: ${cronExpression}`);
                return null;
            }

            // Calcular próxima ejecución
            const nextRun = moment().tz(taskTimezone).add(1, 'minute');

            // Usar moment para encontrar la próxima fecha válida según la expresión cron
            let testDate = moment(nextRun);
            let attempts = 0;
            const maxAttempts = 1000; // Evitar bucle infinito

            while (attempts < maxAttempts) {
                if (cron.validate(cronExpression)) {
                    const schedule = cron.schedule(cronExpression, () => { }, { scheduled: false });

                    // Aproximación: avanzar minuto a minuto hasta encontrar coincidencia
                    const cronParts = cronExpression.split(' ');
                    const minute = cronParts[0];
                    const hour = cronParts[1];
                    const dayOfMonth = cronParts[2];
                    const month = cronParts[3];
                    const dayOfWeek = cronParts[4];

                    if (matchesCronExpression(testDate, cronExpression)) {
                        const nextRunFormatted = testDate.format('YYYY-MM-DD HH:mm:ss');
                        await this.taskService.updateTaskNextRun(taskId, nextRunFormatted);

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

    // Función auxiliar para verificar si una fecha coincide con expresión cron
    matchesCronExpression(date, cronExpression) {
        const parts = cronExpression.split(' ');
        if (parts.length !== 5) return false;

        const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

        // Verificar minuto
        if (minute !== '*' && minute !== date.minute().toString()) return false;

        // Verificar hora
        if (hour !== '*' && hour !== date.hour().toString()) return false;

        // Verificar día del mes
        if (dayOfMonth !== '*' && dayOfMonth !== date.date().toString()) return false;

        // Verificar mes (moment usa 0-11, cron usa 1-12)
        if (month !== '*' && month !== (date.month() + 1).toString()) return false;

        // Verificar día de la semana (moment: 0=domingo, cron: 0=domingo)
        if (dayOfWeek !== '*' && dayOfWeek !== date.day().toString()) return false;

        return true;
    }

    // Ejecutar script usando spawn según el tipo
    execute(task) {
        return new Promise((resolve, reject) => {
            let command, args;

            // Configurar comando según el tipo de script
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

            // Agregar parámetros si existen
            if (task.parameters) {
                const params = JSON.parse(task.parameters);
                args.push(...params);
            }

            logger.info(`Ejecutando: ${command} ${args.join(' ')} (Tarea ID: ${task.id})`);

            // Agregar información de programación al log
            if (task.scheduled_at) {
                logger.info(`Tarea ${task.id} programada originalmente para: ${moment(task.scheduled_at).format('YYYY-MM-DD HH:mm:ss')}`);
            }

            if (task.cron_expression) {
                logger.info(`Tarea ${task.id} es recurrente con expresión cron: ${task.cron_expression}`);
            }

            // Ejecutar el proceso
            const process = spawn(command, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                detached: true // Permite que el proceso se ejecute independientemente
            });

            let stdout = '';
            let stderr = '';

            // Capturar salida estándar
            process.stdout.on('data', (data) => {
                const output = data.toString();
                stdout += output;
                logger.info(`[${task.id}] STDOUT: ${output.trim()}`);
            });

            // Capturar errores
            process.stderr.on('data', (data) => {
                const error = data.toString();
                stderr += error;
                logger.error(`[${task.id}] STDERR: ${error.trim()}`);
            });

            // Manejar cierre del proceso
            process.on('close', (code) => {
                logger.info(`Proceso ${task.id} terminado con código: ${code}`);

                if (code === 0) {
                    resolve({ success: true, output: stdout, error: null });
                } else {
                    resolve({ success: false, output: stdout, error: stderr });
                }
            });

            // Manejar errores del proceso
            process.on('error', (error) => {
                logger.error(`Error ejecutando tarea ${task.id}:`, error);
                reject(error);
            });

            // Desconectar el proceso padre para que funcione como nohup
            process.unref();
        });
    }

}

module.exports = ExecuteScript;