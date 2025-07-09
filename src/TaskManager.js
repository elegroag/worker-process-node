const fs = require('fs').promises;
const {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} = require('worker_threads');

// Datos de ejemplo de tareas
const tasksData = {
  tasks: [
    {
      id: 1,
      type: 'calculation',
      data: { operation: 'factorial', number: 10 },
      priority: 'high',
    },
    {
      id: 2,
      type: 'text_processing',
      data: { text: 'Hola Mundo desde Worker Thread', operation: 'uppercase' },
      priority: 'medium',
    },
    {
      id: 3,
      type: 'calculation',
      data: { operation: 'fibonacci', number: 15 },
      priority: 'low',
    },
    {
      id: 4,
      type: 'text_processing',
      data: { text: 'Este es un texto para procesar', operation: 'reverse' },
      priority: 'high',
    },
    {
      id: 5,
      type: 'calculation',
      data: { operation: 'prime_check', number: 97 },
      priority: 'medium',
    },
    {
      id: 6,
      type: 'data_analysis',
      data: {
        numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        operation: 'statistics',
      },
      priority: 'low',
    },
  ],
};

// PROCESO PRINCIPAL
class TaskManager {
  constructor(maxWorkers = 4) {
    this.maxWorkers = maxWorkers;
    this.workers = [];
    this.taskQueue = [];
    this.activeWorkers = 0;
    this.completedTasks = [];
    this.failedTasks = [];
  }

  async initialize() {
    console.log('🚀 Iniciando Task Manager...');

    // Crear archivo JSON de tareas si no existe
    try {
      await fs.writeFile('tasks.json', JSON.stringify(tasksData, null, 2));
      console.log('📄 Archivo tasks.json creado con datos de ejemplo');
    } catch (error) {
      console.error('❌ Error creando archivo de tareas:', error);
    }

    // Cargar tareas desde JSON
    await this.loadTasks();

    // Procesar tareas
    await this.processTasks();

    // Mostrar resultados
    this.showResults();
  }

  async loadTasks() {
    try {
      const data = await fs.readFile('tasks.json', 'utf8');
      const jsonData = JSON.parse(data);
      this.taskQueue = jsonData.tasks.sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      });
      console.log(`📋 Cargadas ${this.taskQueue.length} tareas desde JSON`);
    } catch (error) {
      console.error('❌ Error cargando tareas:', error);
    }
  }

  async processTasks() {
    console.log('⚡ Iniciando procesamiento de tareas...\n');

    const promises = [];

    // Crear workers y asignar tareas
    for (let i = 0; i < Math.min(this.maxWorkers, this.taskQueue.length); i++) {
      promises.push(this.createWorker());
    }

    // Esperar a que todas las tareas terminen
    await Promise.all(promises);

    console.log('\n✅ Todas las tareas han sido procesadas');
  }

  async createWorker() {
    while (this.taskQueue.length > 0) {
      const task = this.taskQueue.shift();

      return new Promise((resolve, reject) => {
        console.log(
          `🔄 Procesando tarea ${task.id} (${task.type}) - Prioridad: ${task.priority}`
        );

        const worker = new Worker(__dirname + '/WorkerThread.js', {
          workerData: task,
        });

        const startTime = Date.now();

        worker.on('message', (result) => {
          const endTime = Date.now();
          const duration = endTime - startTime;

          console.log(`✅ Tarea ${task.id} completada en ${duration}ms`);
          console.log(`📊 Resultado: ${JSON.stringify(result, null, 2)}\n`);

          this.completedTasks.push({
            ...task,
            result,
            duration,
            completedAt: new Date().toISOString(),
          });

          worker.terminate();
          resolve();
        });

        worker.on('error', (error) => {
          console.error(`❌ Error en tarea ${task.id}:`, error);

          this.failedTasks.push({
            ...task,
            error: error.message,
            failedAt: new Date().toISOString(),
          });

          worker.terminate();
          resolve();
        });

        worker.on('exit', (code) => {
          if (code !== 0) {
            console.error(`⚠️ Worker terminó con código: ${code}`);
          }
        });
      });
    }
  }

  async showResults() {
    console.log('\n📈 RESUMEN DE RESULTADOS:');
    console.log('========================');
    console.log(`✅ Tareas completadas: ${this.completedTasks.length}`);
    console.log(`❌ Tareas fallidas: ${this.failedTasks.length}`);

    if (this.completedTasks.length > 0) {
      const avgDuration =
        this.completedTasks.reduce((sum, task) => sum + task.duration, 0) /
        this.completedTasks.length;
      console.log(`⏱️ Tiempo promedio: ${avgDuration.toFixed(2)}ms`);
    }

    // Guardar resultados en archivo
    const results = {
      summary: {
        completed: this.completedTasks.length,
        failed: this.failedTasks.length,
        processedAt: new Date().toISOString(),
      },
      completedTasks: this.completedTasks,
      failedTasks: this.failedTasks,
    };

    await fs.writeFile('results.json', JSON.stringify(results, null, 2));
    console.log('💾 Resultados guardados en results.json');
  }
}

module.exports = TaskManager;
