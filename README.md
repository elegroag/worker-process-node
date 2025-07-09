### Características Proyecto Worker Process con NODE JS:

####  **Funcionalidades principales**:

* Procesamiento concurrente: Utiliza múltiples worker threads para procesar tareas simultáneamente
* Gestión de prioridades: Las tareas se ordenan por prioridad (high, medium, low)
* Tipos de tareas múltiples: Cálculos matemáticos, procesamiento de texto y análisis de datos
* Persistencia de resultados: Guarda los resultados en archivos JSON

#### **Estructura del sistema:**

* Proceso principal: Gestiona la cola de tareas y los workers
* Worker threads: Ejecutan las tareas de forma independiente
* Datos JSON: Las tareas se cargan desde un archivo JSON

#### Tipos de tareas implementadas:

* Cálculos: Factorial, Fibonacci, verificación de números primos
* Procesamiento de texto: Mayúsculas, reversa, conteo de palabras
* Análisis de datos: Estadísticas básicas (promedio, mediana, etc.)

#### **Cómo ejecutar:**

* Guarda el código en un archivo llamado main.js
* Crea el package.json con la configuración mostrada

* Ejecuta:

```bash
pnpm update
pnpm run start
```
