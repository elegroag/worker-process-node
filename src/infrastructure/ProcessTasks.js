
const { Worker } = require('node:worker_threads');
const logger = require('../../logger.js');
const TaskServices = require('../services/TaskServices.js');
const WORKER_SCRIPT_PATH = './TaskWorker.js';
const path = require('node:path');
const ExecuteScript = require('./ExecuteScript.js');

// Procesar tareas pendientes
class ProcessTasks {

    runTaskInWorker(task) {
        return new Promise((resolve, reject) => {
            logger.info(`Ejecutando tarea en Worker: '${task.id}'.`);

            const worker = new Worker(path.resolve(__dirname, WORKER_SCRIPT_PATH), {
                workerData: task
            });

            worker.on('message', (result) => {
                if (result && result.success === true) {
                    logger.info(`📊 Resultado: OK Worker\n`);
                    resolve(true);
                } else {
                    logger.error(`❌ Error en tarea ${task.id}:`, result.error);
                    worker.terminate(0);
                    resolve(false);
                }
            });

            // Escucha si hay errores inesperados en el worker
            worker.on('error', (err) => {
                logger.error(`❌ Error en tarea ${task.id}:`, err);
                worker.terminate(0);
                resolve(false);
            });

            // Escucha cuando el worker sale (termina su ejecución, ya sea exitosamente o por un error)
            worker.on('exit', (code) => {
                if (code !== 0) {
                    logger.info(`[Hilo Principal] Worker de ${task.id} detenido con código de salida ${code}`);
                }
                resolve(true);
            });
        });
    }

    runTaskInChildProcess(task) {
        const taskServices = new TaskServices();
        const executeScript = new ExecuteScript();

        executeScript.execute(task).then(async (result) => {
            // Actualizar estado según el resultado
            if (result.success) {
                await taskServices.updateTaskStatus(task.id, 'completed', result.output, null);
            } else {
                await taskServices.updateTaskStatus(task.id, 'failed', result.output, result.error);
            }
        });

    }

    async execute() {
        try {
            const taskServices = new TaskServices();
            const tasks = await taskServices.getPendingTasks();

            if (tasks.length === 0) {
                logger.info('No hay tareas pendientes');
                return;
            }

            logger.info(`Procesando ${tasks.length} tareas pendientes`);

            // Procesar cada tarea
            for (const task of tasks) {
                try {
                    if (task.status === 'running') continue;
                    if (task.cron_expression && task.cron_expression != '') continue;
                    //await calculateNextRun(task.id, task.cron_expression, TIMEZONE);

                    // Marcar como "running"
                    await taskServices.updateTaskStatus(task.id, 'running');
                    //Ejecutar script
                    this.runTaskInChildProcess(task);

                    //proceso ejecutado mediante workers
                    //this.runTaskInWorker(task);

                } catch (error) {
                    logger.error(`Error procesando tarea ${task.id}:`, error);
                    await taskServices.updateTaskStatus(task.id, 'failed', null, error.message);
                }
            }
        } catch (error) {
            logger.error('Error en processTasks:', error);
        }
    }
}

module.exports = () => {
    return new ProcessTasks();
}