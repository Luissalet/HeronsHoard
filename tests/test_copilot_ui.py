"""Node tests for the assistant-context helpers and the shipping UI script, plus backend pins."""
from pathlib import Path
import shutil
import subprocess

import pytest
from fastapi.testclient import TestClient

from heron.api import create_app
from heron.geometry import templates

ROOT = Path(__file__).resolve().parents[1]


def test_copilot_context_node_tests_pass():
    node = shutil.which("node")
    if not node:
        pytest.skip("Node required for the UI context tests")
    result = subprocess.run([node, "--test", "tests/copilot-context.test.mjs"], cwd=ROOT, capture_output=True, text=True, timeout=120)
    assert result.returncode == 0, result.stdout + result.stderr


def test_ui_scripts_are_served_and_loaded_by_the_page(tmp_path):
    html = (ROOT / "ui/index.html").read_text(encoding="utf-8")
    assert html.index("/copilot-context.js") < html.index("/app.js")
    with TestClient(create_app(tmp_path, 5204), base_url="http://127.0.0.1:5204") as client:
        for path in ("/copilot-context.js", "/app.js"):
            response = client.get(path)
            assert response.status_code == 200 and "javascript" in response.headers["content-type"]
        assert "hoardCopilot" in client.get("/app.js").text


def test_builds_are_immutable_so_an_agent_build_survives_a_user_save(tmp_path):
    """There is no in-place update: a changed recipe is a new build with a new id, never a replace."""
    with TestClient(create_app(tmp_path, 5204), base_url="http://127.0.0.1:5204") as client:
        client.headers["Authorization"] = "Bearer " + (tmp_path / "mcp-token").read_text()
        recipe = templates()["plate"]
        agent = client.post("/api/builds", json={"request_id": "agent-1", "recipe": recipe}).json()
        assert agent["state"] == "finished"
        edited = {**recipe, "title": "User edit"}
        assert client.post("/api/builds", json={"request_id": "agent-1", "recipe": edited}).status_code == 400
        user = client.post("/api/builds", json={"request_id": "user-1", "recipe": edited}).json()
        assert user["state"] == "finished" and user["recipe"]["title"] == "User edit"
        assert client.get("/api/builds/agent-1").json()["recipe"]["title"] == recipe["title"]
        assert [b["id"] for b in client.get("/api/builds").json()["builds"]] == ["user-1", "agent-1"]
