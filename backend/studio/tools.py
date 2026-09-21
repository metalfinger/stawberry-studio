"""Host-neutral tool contracts backed exclusively by the Studio service."""

from pydantic import BaseModel, ConfigDict

from backend.studio import models
from backend.studio.store import StudioError


class Empty(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Identifier(Empty):
    id: str


class Selection(Empty):
    node_id: str
    media_id: str
    revision: int


class ImportMedia(Empty):
    node_id: str
    path: str
    label: str


class ExternalPreview(Identifier):
    provider_id: str


class Export(Identifier):
    path: str


class Feedback(Empty):
    media_id: str
    text: str


READS = {
    "projects": "projects", "project": "project", "inspect": "inspect",
    "context": "context", "workflow": "workflow", "readiness": "readiness",
    "recipe": "recipe", "job": "job", "media": "media",
}
WRITES = {
    "create": ("create_node", models.NodeCreate, False),
    "patch": ("patch_node", models.NodePatch, True),
    "capture": ("capture", models.SourceCreate, True),
    "prepare": ("prepare", models.RecipeCreate, False),
    "approve": ("approve", models.Approval, True),
    "review": ("review_media", models.MediaReview, True),
    "reorder": ("reorder", models.Reorder, True),
    "create_requirement": ("create_requirement", models.AssetRequirementCreate, True),
    "update_requirement": ("update_requirement", models.AssetRequirementUpdate, True),
    "approve_batch": ("approve_batch", models.BatchApproval, False),
}


def catalog():
    result = []
    for name in READS:
        schema = Empty if name == "projects" else Identifier
        result.append({"name": name, "inputSchema": schema.model_json_schema(), "readOnly": True})
    for name, (_, model, needs_id) in WRITES.items():
        schema = model.model_json_schema()
        if needs_id:
            schema = {"type": "object", "properties": {
                "id": {"type": "string"}, "request": schema,
            }, "required": ["id", "request"], "additionalProperties": False}
        result.append({"name": name, "inputSchema": schema, "readOnly": False})
    for name, schema in (("enqueue", Identifier), ("select", Selection),
                         ("import_media", ImportMedia), ("external_preview", ExternalPreview),
                         ("export_project", Export), ("feedback", Feedback),
                         ("retry_collection", Identifier)):
        result.append({"name": name, "inputSchema": schema.model_json_schema(),
                       "readOnly": name == "external_preview"})
    schema = {"type": "object", "properties": {
        "id": {"type": "string"}, "request": models.Reconciliation.model_json_schema(),
    }, "required": ["id", "request"], "additionalProperties": False}
    result.append({"name": "attach_external", "inputSchema": schema, "readOnly": False})
    return result


def invoke(studio, name, arguments):
    if name in READS:
        request = (Empty if name == "projects" else Identifier).model_validate(arguments)
        return getattr(studio, READS[name])(*([] if name == "projects" else [request.id]))
    if name in WRITES:
        method, model, needs_id = WRITES[name]
        if needs_id:
            if set(arguments) != {"id", "request"}:
                raise StudioError("invalid_request", "Expected id and request")
            return getattr(studio, method)(arguments["id"], model.model_validate(arguments["request"]))
        return getattr(studio, method)(model.model_validate(arguments))
    if name == "enqueue":
        return studio.enqueue(Identifier.model_validate(arguments).id)
    if name == "retry_collection":
        return studio.retry_collection(Identifier.model_validate(arguments).id)
    if name == "feedback":
        request = Feedback.model_validate(arguments)
        return studio.feedback(request.media_id, request.text)
    if name == "export_project":
        from backend.studio.project_archive import export_project

        request = Export.model_validate(arguments)
        return export_project(studio.store, request.id, request.path)
    if name == "select":
        request = Selection.model_validate(arguments)
        return studio.select(request.node_id, request.media_id, request.revision)
    if name == "import_media":
        request = ImportMedia.model_validate(arguments)
        return studio.import_media(request.node_id, request.path, request.label)
    if name == "external_preview":
        request = ExternalPreview.model_validate(arguments)
        return studio.execution.preview_external_submission(request.id, request.provider_id)
    if name == "attach_external":
        if set(arguments) != {"id", "request"}:
            raise StudioError("invalid_request", "Expected id and request")
        return studio.execution.attach_external_submission(
            arguments["id"], models.Reconciliation.model_validate(arguments["request"]))
    raise StudioError("unknown_tool", f"Unknown Studio tool: {name}")
