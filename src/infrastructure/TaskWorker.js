const { parentPort, workerData } = require('node:worker_threads');
const ExecuteScript = require('./ExecuteScript.js');
const TaskServices = require('../services/TaskServices.js');
const logger = require('../../logger.js');

const task = workerData;
try {
    const executeScript = new ExecuteScript();
    const taskServices = new TaskServices();

    executeScript.execute(task).then(async (result) => {
        // Actualizar estado según el resultado
        if (result.success) {
            await taskServices.updateTaskStatus(task.id, 'completed', result.output, null);
        } else {
            await taskServices.updateTaskStatus(task.id, 'failed', result.output, result.error);
        }
        parentPort.postMessage(result);
    });

} catch (error) {
    logger.error(`[Worker - ${task.id}] Error al ejecutar la tarea:`, error);
    parentPort.postMessage({ success: false, taskId: task.id, error: error.message });
}

parentPort.on('error', (err) => {
    logger.error(`[Worker - ${task.id}] Error capturado en el worker:`, err);
    process.exit(0);
});