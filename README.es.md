# Heron's Hoard

Taller local de CAD con medidas para Faustus. Crea sólidos paramétricos en milímetros, conserva sus recetas y exporta STEP y STL comprobados. Complementa el modelado artístico de Gepetto, los proyectos de Plato y el catálogo de Vulcan.

## Qué permite hacer

- Combinar cajas, cilindros y esferas con unión, corte e intersección.
- Definir medidas, posición y rotaciones; redondear las aristas del resultado.
- Partir de una placa perforada, un separador o un soporte en L.
- Conservar recetas, resultados y exportaciones por identificador de encargo.
- Revisar las vistas frontal, superior y en perspectiva, también en móvil.
- Comprobar sólidos válidos y volumen positivo en OCCT, cierre y orientación de la malla STL con trimesh, y volumen después de reimportar el STEP.
- Usar las mismas operaciones desde la interfaz, REST, el Hub o MCP.

Cada resultado registra tamaño y SHA-256 de sus cinco exportaciones. La descarga rechaza un archivo modificado después de la verificación. Las medidas de la receta son milímetros; las cajas envolventes de superficies curvas pueden incluir tolerancia del motor. Las comprobaciones de geometría no certifican resistencia mecánica ni ajustes de una impresora.

## Instalación local

Desde esta carpeta, con Python 3.13 en Windows:

```powershell
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
.venv/Scripts/python.exe -m pip install -e ../HoardLink
.venv/Scripts/python.exe -m heron --no-browser
```

En este equipo ya hay un entorno propio instalado y un plugin registrado en Faustus. El puerto predeterminado es `5204`; no necesita GPU ni descarga de modelos. En otro equipo, configurar `HERON_DIR` en el plugin. La aplicación escucha en `127.0.0.1`; el Hub controla su apertura y cierre.

Abrir `http://127.0.0.1:5204` como navegación local habilita la interfaz mediante una cookie HttpOnly y SameSite Strict. Las llamadas de agentes utilizan el token generado en `data/mcp-token`. El guard compartido comprueba Host, Origin, puerto y contexto de navegación; una página externa no puede llamar al API. Para un acceso humano configurado fuera de loopback, se requiere el enlace explícito con token. No mostrar ni copiar tokens en conversaciones.

`--port` y `--data-dir` permiten instancias de prueba independientes. `HERON_PORT` y `HERON_DATA_DIR` ofrecen los mismos valores por entorno. Al cambiar puerto o datos, ajustar también `APP_URL` y `TOKEN_FILE` del plugin.

## Herramientas para Faustus

| Herramienta | Uso |
| --- | --- |
| `cad_templates` | Plantillas y esquema completo de receta. |
| `cad_build` | Construir, verificar y guardar con `request_id` y `recipe`. |
| `cad_get` | Recuperar un encargo y sus enlaces de exportación. |
| `cad_list` | Consultar el historial. |

REST: `GET /api/agent/tools` y `POST /api/agent/call` con bearer token. `mcp_server.py` conecta por stdio al mismo servicio y utiliza los mismos handlers. El plugin usa el intérprete del entorno propio.

Una modificación necesita un identificador nuevo. Tras un fallo de comunicación, consultar o reutilizar el identificador anterior evita duplicados. Un encargo que quedó `running` tras perder su servidor exige inspeccionar el proceso antes de resolverlo; no se repite automáticamente. El proceso de construcción tiene un límite de 120 segundos y conserva sus archivos. El almacén acepta una construcción activa por instancia.

## Flujo de trabajo

Pedir a Faustus una pieza con medidas y consultar `cad_templates` → editar una receta → construir con un identificador estable → revisar vistas e informe → descargar STEP/STL → catalogar el derivado en Vulcan. El Hub incluye este recorrido en `measured-cad`. Ese recorrido es un plan de capacidades; no publica ni ejecuta etapas por sí solo.

## Alcance y pruebas

El formato admite hasta 50 primitivas, dimensiones de hasta 2000 mm, posiciones de ±10000 mm y rotaciones de ±360°. Rechaza código, expresiones, rutas arbitrarias, valores no finitos y campos desconocidos. No incorpora todavía un editor de croquis, ensamblajes, importación editable de STEP ni simulación física.

```powershell
.venv/Scripts/python.exe -m pip install pytest
.venv/Scripts/python.exe -m pytest -q tests
```

Las pruebas construyen las tres plantillas con el motor real y comparan volúmenes conocidos, reimportación STEP, malla STL, esquemas, autenticación, idempotencia e integridad de descargas. También se ha probado una construcción por MCP y por la interfaz en escritorio y móvil.

## Licencias

El código original de este hoard se distribuye bajo MIT; ver `LICENSE`. CadQuery utiliza Apache 2.0 y las dependencias conservan sus propias licencias. No se ha copiado código de los repositorios de las capturas. Motor y documentación: [CadQuery](https://github.com/CadQuery/cadquery), [exportación e importación](https://cadquery.readthedocs.io/en/latest/importexport.html).
