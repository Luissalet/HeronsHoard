import math
import pytest
from pydantic import ValidationError
from fastapi.testclient import TestClient
from heron.geometry import Recipe,templates,export
from heron.store import Store
from heron.api import create_app


@pytest.mark.parametrize('name',['plate','spacer','bracket'])
def test_real_kernel_and_exports_round_trip(tmp_path,name):
    report=export(Recipe.model_validate(templates()[name]),tmp_path/name)
    assert report['valid'] and report['mesh']['watertight'] and report['mesh']['winding_consistent']
    assert len(report['files'])==5 and all(len(v['sha256'])==64 and v['bytes']>100 for v in report['files'].values())
    import xml.etree.ElementTree as ET
    import re
    for view in ('isometric','front','top'):
        svg=ET.parse(tmp_path/name/(view+'.svg')).getroot()
        assert svg.attrib['viewBox']=='0 0 800 600'
        group=svg.find('{http://www.w3.org/2000/svg}g')
        scale,negative,tx,ty=map(float,re.findall(r'-?\d+(?:\.\d+)?(?:e[+-]?\d+)?',group.attrib['transform']))
        for path in svg.iter('{http://www.w3.org/2000/svg}path'):
            for x,y in re.findall(r'[ML]([^, ]+),([^ ]+)',path.attrib['d']):
                assert 1<(float(x)+tx)*scale<799
                assert 1<(float(y)+ty)*negative<599
    if name=='spacer':assert math.isclose(report['volume_mm3'],math.pi*(12**2-4**2)*20,rel_tol=1e-8)
    if name=='plate':assert math.isclose(report['volume_mm3'],80*50*5-4*math.pi*3**2*5,rel_tol=1e-8)
    assert abs(report['mesh']['volume_mm3']/report['volume_mm3']-1)<.01


def test_boundaries_and_no_arbitrary_code_or_paths():
    for data in [{'parts':[{'kind':'exec','size':[1,2,3]}]}, {'parts':[{'size':[0,1,1]}]}, {'parts':[{'position':[float('nan'),0,0]}]}, {'parts':[{'operation':'cut'}]}, {'parts':[{}],'code':'anything'}, {'parts':[{}],'units':'in'}]:
        with pytest.raises(ValidationError):Recipe.model_validate(data)


def test_http_worker_idempotency_hashes_and_private_contract(tmp_path):
    app=create_app(tmp_path,5204)
    token=(tmp_path/'mcp-token').read_text()
    with TestClient(app,base_url='http://127.0.0.1:5204') as client:
        assert client.get('/api/builds').status_code==401
        assert client.get('/api/health',headers={'Host':'evil.example'}).status_code==403
        client.headers['Authorization']='Bearer '+token
        catalog=client.get('/api/agent/tools').json()
        assert len(catalog['tools'])==4
        recipe=templates()['plate'];args={'request_id':'plate-test','recipe':recipe}
        one=client.post('/api/builds',json=args).json()
        assert one['state']=='finished',one
        two=client.post('/api/agent/call',json={'tool':'cad_build','arguments':args}).json()['result']
        assert one==two
        assert client.get(one['downloads']['model.step']).status_code==200
        changed={**recipe,'title':'changed'}
        assert client.post('/api/builds',json={'request_id':'plate-test','recipe':changed}).status_code==400
        stl=tmp_path/'plate-test'/'model.stl';stl.write_bytes(stl.read_bytes()+b'changed')
        assert client.get(one['downloads']['model.stl']).status_code==404
        assert client.get('/api/builds/plate-test/files/recipe.json').status_code==404


def test_hub_navigation_unlocks_only_local_document_ui(tmp_path):
    app=create_app(tmp_path,5204)
    with TestClient(app,base_url='http://127.0.0.1:5204') as client:
        assert client.get('/api/templates').status_code==401
        foreign=client.get('/',headers={'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'})
        assert foreign.status_code==200 and 'set-cookie' not in foreign.headers
        assert client.get('/',headers={'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'iframe'}).status_code==403
        local=client.get('/',headers={'Sec-Fetch-Site':'none','Sec-Fetch-Dest':'document'})
        assert 'HttpOnly' in local.headers['set-cookie'] and 'SameSite=strict' in local.headers['set-cookie']
        assert client.get('/api/templates').status_code==200
        assert client.post('/api/builds',headers={'Origin':'https://evil.example'},json={}).status_code==403
