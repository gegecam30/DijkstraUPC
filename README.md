# DijkstraUPC

Demostración web del visualizador de Dijkstra sobre grafos dirigidos acíclicos (DAG). Es una versión en JavaScript del programa en Python: mismos modos, mismos pasos y mismos mensajes.

- Programa en Python: https://github.com/TUXERO1986/Proyecto_dijkstra_Mate_Computacional
- Sitio: https://gegecam30.github.io/DijkstraUPC/

## Qué incluye
- **Aleatorio:** origen y destino fijos, saltos mínimos, máximo de salidas por nodo, densidad, arista directa prohibida, empate forzado, caminos alternativos y rango de pesos.
- **Formulario:** agregar aristas con listas desplegables.
- **Dibujo:** clic para crear nodos, arrastrar de nodo a nodo para crear aristas (con validación de ciclos), Shift para mover y clic derecho para borrar.
- **Guardar / Cargar:** JSON con el mismo formato que la aplicación de escritorio.
- **Paso a paso:** tabla de distancias, mensaje de cada paso, todos los caminos mínimos y modo oscuro.

## Estructura
```
index.html        página y réplica de la ventana de la aplicación
css/              site.css (sitio) y tk.css (ventana de la demo)
js/graph.js       grafo, generador y JSON            (graph_model.py)
js/dijkstra.js    pasos de Dijkstra y backtracking   (dijkstra.py)
js/render.js      dibujo SVG, zoom y gestos          (visualizer.py)
js/app.js         interfaz y modos                   (ui.py)
ejemplos/         grafo de ejemplo de 8 nodos
tests/            pruebas con node:test
assets/           íconos y avatares
```

## Ejecutar en local
No necesita compilación. Hay que servir la carpeta con cualquier servidor estático:

```
python -m http.server 8000
```

y abrir http://localhost:8000.

## Pruebas
Requiere Node.js 18 o superior.

```
node --test tests/nucleo.test.mjs
```

Las pruebas comprueban el generador (DAG, saltos mínimos, grado máximo, empate), Dijkstra contra fuerza bruta y el caso del ejemplo (d* = 13, dos caminos, 23 pasos), igual que la versión de Python.

## Créditos
Los íconos de objetos son texturas de Minecraft (Mojang Studios), obtenidas de [PrismarineJS/minecraft-assets](https://github.com/PrismarineJS/minecraft-assets) y usadas solo como decoración. Este proyecto no está afiliado a Mojang ni a Microsoft.
