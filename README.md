# Heron's Hoard

A local measured CAD workshop for Faustus. Declarative millimetre recipes create solid primitives, Boolean combinations, rotations and fillets. CadQuery/OCCT exports STEP and STL plus isometric, front and top SVG views. It complements Gepetto's artistic modelling, Plato's projects and Vulcan's model catalogue.

Start with a drilled plate, spacer or L bracket. Every build retains its recipe and receipt; the kernel validates positive solids, trimesh independently checks STL watertightness and winding, and STEP is reimported to compare volume. Export hashes protect downloads from subsequent modification. Curved bounding boxes may include kernel tolerance; these checks do not certify structural strength or printer settings.

## Setup

Use Python 3.13 and a dedicated environment, with the sibling HoardLink installed editable:

```powershell
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
.venv/Scripts/python.exe -m pip install -e ../HoardLink
.venv/Scripts/python.exe -m heron --no-browser
```

The default is `http://127.0.0.1:5204`; no GPU or model download is needed. The local environment and Faustus plugin are already installed on this computer. Set `HERON_DIR` when using the portable manifest elsewhere. The Hub owns process launch and navigation.

Local document navigation unlocks the UI through an HttpOnly, SameSite Strict cookie. Agent calls require the generated `data/mcp-token`; shared Host/Origin/port/Fetch Metadata guards block external pages. Configured access beyond loopback requires an explicit token link. Keep tokens out of chat and logs. `--port`, `--data-dir`, `HERON_PORT` and `HERON_DATA_DIR` configure isolated instances; update the plugin's `APP_URL` and `TOKEN_FILE` accordingly.

## Agent interface

`cad_templates` returns starter recipes and the full schema; `cad_build` accepts `request_id` and `recipe`; `cad_get` retrieves a receipt; `cad_list` lists retained builds. REST catalogue `/api/agent/tools` and calls `/api/agent/call` use bearer authentication. The independent stdio `mcp_server.py` uses the same HTTP handlers.

Reuse an ID after communication uncertainty; changed recipes require a new ID. One build runs per instance, with a 120-second worker timeout. If a server is lost during a build, inspect the worker before resolving its retained `running` state; automatic retries are disabled. The Hub's `measured-cad` workflow identifies providers for CAD, catalogue and product stages without automatically running or publishing anything.

Limits: 50 primitives; dimensions up to 2000 mm; translations ±10000 mm; rotations ±360°. No evaluated code, arbitrary paths or unknown fields. Sketch editing, assemblies, editable STEP import and physical simulation are not implemented.

## Verification and licence

Install pytest and run `.venv/Scripts/python.exe -m pytest -q tests`. Tests exercise real CAD construction, analytic volumes, STEP round trips, STL meshes, API guards, replay protection and download hashes. A real stdio MCP build and desktop/mobile UI build/download have also been checked.

Original code: MIT, see `LICENSE`. Dependencies retain their licences; CadQuery is Apache 2.0. See [CadQuery](https://github.com/CadQuery/cadquery) and its [import/export documentation](https://cadquery.readthedocs.io/en/latest/importexport.html). The detailed Spanish guide is [README.es.md](README.es.md).
