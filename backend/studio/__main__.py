"""JSON CLI for Codex. Local mutations use the same engine as the viewer."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from pydantic import ValidationError

from backend.studio.models import Approval, NodeCreate, NodePatch, RecipeCreate, SourceCreate
from backend.studio.service import Studio
from backend.studio.store import Store, StudioError


def read_json(path):
    return json.loads(sys.stdin.read() if path == "-" else Path(path).read_text())


def main():
    parser = argparse.ArgumentParser(
        prog="strawberry", description="Local filmmaking workspace. JSON output; no internal LLM calls."
    )
    parser.add_argument("--home", help="Isolated project store directory")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("projects")
    p = sub.add_parser("backup", help="Snapshot database and managed media to a new ZIP archive")
    p.add_argument("path")
    p = sub.add_parser("restore", help="Verify and restore a workspace into a new directory")
    p.add_argument("path")
    p.add_argument("--to", required=True)
    p = sub.add_parser("start", help="Build and run the local viewer, API and worker")
    p.add_argument("--port", type=int, default=8787)
    p.add_argument("--allow-higgsfield", action="store_true")
    for name in ("project", "inspect", "context", "recipe", "job", "media", "enqueue", "retry-collection"):
        p = sub.add_parser(name)
        p.add_argument("id")
    p = sub.add_parser("revision")
    p.add_argument("id")
    p.add_argument("number", type=int)
    for name in ("create", "prepare"):
        p = sub.add_parser(name)
        p.add_argument("file", help="JSON file, or - for stdin")
    for name in ("patch", "capture", "approve"):
        p = sub.add_parser(name)
        p.add_argument("id")
        p.add_argument("file", help="JSON file, or - for stdin")
    p = sub.add_parser("import-media")
    p.add_argument("node_id")
    p.add_argument("path")
    p.add_argument("--label", required=True)
    p = sub.add_parser("select")
    p.add_argument("node_id")
    p.add_argument("media_id")
    p.add_argument("--revision", type=int, required=True)
    p = sub.add_parser("feedback")
    p.add_argument("media_id")
    p.add_argument("text")
    p = sub.add_parser("worker")
    p.add_argument("--once", action="store_true")
    p.add_argument(
        "--allow-higgsfield",
        action="store_true",
        help="Enable paid provider execution; every recipe still requires approval",
    )
    p = sub.add_parser("serve")
    p.add_argument("--port", type=int, default=8787)
    sub.add_parser("demo", help="Create an explicitly labeled offline three-cut fixture; no external calls")
    args = parser.parse_args()
    try:
        if args.command == "restore":
            from backend.studio.backup import restore

            print(json.dumps(restore(args.path, args.to), indent=2))
            return
        studio = Studio(Store(args.home))
        if args.command == "start":
            from backend.studio.launch import launch

            launch(studio.store.home, args.port, args.allow_higgsfield)
            return
        if args.command == "serve":
            import uvicorn

            from backend.studio.api import create_app

            uvicorn.run(create_app(studio.store.home), host="127.0.0.1", port=args.port, access_log=False)
            return
        if args.command == "worker":
            from backend.studio.worker import Worker

            worker = Worker(studio, allow_higgsfield=args.allow_higgsfield)
            if not args.once:
                worker.run()
                return
            result = {"processed": worker.tick()}
        elif args.command == "projects":
            result = studio.projects()
        elif args.command == "backup":
            from backend.studio.backup import backup

            result = backup(studio.store, args.path)
        elif args.command == "project":
            result = studio.project(args.id)
        elif args.command == "inspect":
            result = studio.inspect(args.id)
        elif args.command == "context":
            result = studio.context(args.id)
        elif args.command == "revision":
            result = studio.revision(args.id, args.number)
        elif args.command == "media":
            result = studio.media(args.id)
        elif args.command == "create":
            result = studio.create_node(NodeCreate.model_validate(read_json(args.file)))
        elif args.command == "patch":
            result = studio.patch_node(args.id, NodePatch.model_validate(read_json(args.file)))
        elif args.command == "capture":
            result = studio.capture(args.id, SourceCreate.model_validate(read_json(args.file)))
        elif args.command == "prepare":
            result = studio.prepare(RecipeCreate.model_validate(read_json(args.file)))
        elif args.command == "recipe":
            result = studio.recipe(args.id)
        elif args.command == "approve":
            result = studio.approve(args.id, Approval.model_validate(read_json(args.file)))
        elif args.command == "enqueue":
            result = studio.enqueue(args.id)
        elif args.command == "job":
            result = studio.job(args.id)
        elif args.command == "retry-collection":
            result = studio.retry_collection(args.id)
        elif args.command == "import-media":
            result = studio.import_media(args.node_id, args.path, args.label)
        elif args.command == "select":
            result = studio.select(args.node_id, args.media_id, args.revision)
        elif args.command == "feedback":
            result = studio.feedback(args.media_id, args.text)
        elif args.command == "demo":
            from backend.studio.demo import seed_demo

            result = seed_demo(studio)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except (StudioError, ValidationError, ValueError, OSError) as exc:
        print(json.dumps({"error": getattr(exc, "code", "invalid_request"), "message": str(exc)}), file=sys.stderr)
        raise SystemExit(1) from exc
    except KeyboardInterrupt:
        return


if __name__ == "__main__":
    main()
