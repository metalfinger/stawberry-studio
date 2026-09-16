"""Own only the local processes this launcher creates."""

import socket
import subprocess
import sys
import time
from pathlib import Path

import httpx

from backend.studio.store import StudioError


def launch(home: Path, port: int, allow_higgsfield: bool):
    with socket.socket() as probe:
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            probe.bind(("127.0.0.1", port))
        except OSError as exc:
            raise StudioError("port_busy", f"Port {port} is occupied. Choose another port with --port.") from exc
    root = Path(__file__).resolve().parents[2]
    if not (root / "frontend/node_modules").is_dir():
        raise StudioError("dependencies_missing", "Install frontend dependencies before starting the workspace")
    try:
        subprocess.run(["npm", "run", "build"], cwd=root / "frontend", check=True)
    except subprocess.CalledProcessError as exc:
        raise StudioError("build_failed", "Frontend build failed; no workspace processes were started") from exc
    base = [sys.executable, "-m", "backend.studio", "--home", str(home)]
    processes = []
    try:
        server = subprocess.Popen([*base, "serve", "--port", str(port)], cwd=root)
        processes.append(server)
        worker = subprocess.Popen([*base, "worker", *(["--allow-higgsfield"] if allow_higgsfield else [])], cwd=root)
        processes.append(worker)
        for _ in range(40):
            if any(p.poll() is not None for p in processes):
                raise StudioError("startup_failed", "A workspace process stopped during startup")
            try:
                response = httpx.get(f"http://127.0.0.1:{port}/api/studio/health", timeout=1, trust_env=False)
                if response.is_success:
                    break
            except httpx.HTTPError:
                pass
            time.sleep(0.25)
        else:
            raise StudioError("startup_timeout", "Local server did not become healthy")
        print(f"\nStrawberry Studio: http://127.0.0.1:{port}/studio", flush=True)
        print(
            "Higgsfield execution: "
            + ("enabled; approved recipes only" if allow_higgsfield else "disabled; offline jobs only"),
            flush=True,
        )
        while all(p.poll() is None for p in processes):
            time.sleep(0.5)
        raise StudioError("process_stopped", "A workspace process stopped; shutting down its companion")
    finally:
        for process in processes:
            if process.poll() is None:
                process.terminate()
        for process in processes:
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
