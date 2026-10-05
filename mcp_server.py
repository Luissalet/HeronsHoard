"""Independent stdio bridge; HTTP and UI use exactly the same CAD handlers."""
import json
import os
from pathlib import Path
import httpx
from mcp.server.fastmcp import FastMCP

mcp=FastMCP("Heron's Hoard")

def client():
    root=Path(__file__).resolve().parent
    token_file=Path(os.getenv('HERON_TOKEN_FILE',str(root/'data/mcp-token')))
    return httpx.Client(base_url=os.getenv('HERON_URL','http://127.0.0.1:5204'),headers={'Authorization':'Bearer '+token_file.read_text(encoding='utf-8').strip()},timeout=150,trust_env=False,follow_redirects=False)

def call(name,args):
    with client() as http:
        response=http.post('/api/agent/call',json={'tool':name,'arguments':args});response.raise_for_status()
        data=response.json()
        return data['result']

@mcp.tool()
def cad_templates()->dict:
    """Read CAD recipes and schema. Keywords: CAD, medidas, plantillas, sÃ³lidos."""
    return call('cad_templates',{})

@mcp.tool()
def cad_build(request_id:str,recipe:dict)->dict:
    """Build mm-based geometry and verify exports. Keywords: STEP, STL, booleanas, fabricaciÃ³n.
    Reuse request_id after uncertainty. A new recipe/version requires a new id.
    """
    return call('cad_build',{'request_id':request_id,'recipe':recipe})

@mcp.tool()
def cad_get(id:str)->dict:
    """Read a CAD receipt and export links. Keywords: geometrÃ­a, resultados, revisiÃ³n."""
    return call('cad_get',{'id':id})

@mcp.tool()
def cad_list()->dict:
    """List retained CAD recipes and builds. Keywords: piezas, versiones, proyectos."""
    return call('cad_list',{})

if __name__=='__main__':mcp.run()
