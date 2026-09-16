import json
import subprocess
import sys
from pathlib import Path


def test_cli_preserves_input_and_returns_structured_errors(tmp_path):
    command = [sys.executable, "-m", "backend.studio", "--home", str(tmp_path / "workspace")]
    root = Path(__file__).resolve().parents[2]
    create = subprocess.run(
        [*command, "create", "-"],
        input=json.dumps({"kind": "project", "name": "CLI proof", "notes": "  Original text\nsecond line"}),
        cwd=root,
        text=True,
        capture_output=True,
    )
    assert create.returncode == 0, create.stderr
    node = json.loads(create.stdout)
    assert node["notes"] == "  Original text\nsecond line"
    inspect = subprocess.run([*command, "inspect", node["id"]], cwd=root, text=True, capture_output=True)
    assert inspect.returncode == 0, inspect.stderr
    assert json.loads(inspect.stdout)["node"]["id"] == node["id"]
    missing = subprocess.run([*command, "inspect", "nonexistent"], cwd=root, text=True, capture_output=True)
    assert missing.returncode != 0
    assert json.loads(missing.stderr)["error"] == "not_found"
