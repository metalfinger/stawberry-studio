from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue, model_validator


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid")


NodeKind = Literal["project", "scene", "shot", "cut", "character", "location", "prop"]


class NodeCreate(Contract):
    kind: NodeKind
    name: str = Field(min_length=1, max_length=240)
    parent_id: str | None = None
    notes: str = ""


class FieldEdit(Contract):
    op: Literal["set", "clear", "inherit", "add", "remove"] = "set"
    value: JsonValue = None

    @model_validator(mode="after")
    def check_value(self):
        if self.op in {"add", "remove"} and not isinstance(self.value, list):
            raise ValueError("Collection operations require an array")
        if self.op in {"clear", "inherit"} and self.value is not None:
            raise ValueError("clear/inherit do not accept a value")
        return self


class NodePatch(Contract):
    expected_revision: int = Field(ge=1)
    changes: dict[str, FieldEdit] = Field(default_factory=dict)
    name: str | None = Field(default=None, min_length=1, max_length=240)
    notes: str | None = None
    source_id: str | None = None
    reason: str = Field(min_length=1)


class SourceCreate(Contract):
    text: str = Field(min_length=1)
    author: Literal["user", "assistant", "observation"] = "user"
    status: Literal["instruction", "proposal", "approved", "observation"] = "instruction"


class Reference(Contract):
    media_id: str
    role: Literal[
        "base",
        "identity",
        "wardrobe",
        "location",
        "prop",
        "pose",
        "composition",
        "lighting",
        "style",
        "start_frame",
        "end_frame",
    ]
    instruction: str = Field(min_length=1)
    subjects: list[str] = Field(default_factory=list)


class RecipeCreate(Contract):
    node_id: str
    provider: Literal["fake", "higgsfield"] = "higgsfield"
    model: str = Field(min_length=1, pattern=r"^[a-zA-Z0-9_-]+$")
    prompt: str = Field(min_length=1)
    references: list[Reference] = Field(default_factory=list, max_length=32)
    settings: dict[str, JsonValue] = Field(default_factory=dict)
    intent: str = Field(min_length=1)

    @model_validator(mode="after")
    def check_refs(self):
        if sum(r.role == "base" for r in self.references) > 1:
            raise ValueError("At most one edit base can be declared")
        # The engine must never silently reorder a base or another reference.
        for key in self.settings:
            if not key.replace("_", "").isalnum() or key in {
                "prompt",
                "image",
                "input_images",
                "medias",
                "start_image",
                "end_image",
                "video",
                "audio",
                "wait",
                "json",
                "num_images",
            }:
                raise ValueError(f"Setting is reserved or invalid: {key}")
        return self


class Approval(Contract):
    fingerprint: str
    user_decision: str = Field(min_length=1)
    max_credits: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    allow_unknown_cost: bool = False


class Reconciliation(Contract):
    provider_id: str = Field(min_length=1, pattern=r"^[a-zA-Z0-9][a-zA-Z0-9_-]*$")
    fingerprint: str = Field(min_length=64, max_length=64)
    user_decision: str = Field(min_length=1)
    confirm_reference_match: bool = False


class Selection(Contract):
    media_id: str
    expected_revision: int = Field(ge=1)


class Feedback(Contract):
    text: str = Field(min_length=1)


class MediaReview(Contract):
    expected_revision: int = Field(ge=0)
    expected_context: str = Field(min_length=64, max_length=64)
    status: Literal["approved", "rejected"]
    user_decision: str = Field(min_length=1)
    depicted_assets: list[str] = Field(default_factory=list)


class Reorder(Contract):
    kind: NodeKind
    ordered_ids: list[str] = Field(min_length=1)
    expected_revisions: dict[str, int]
    reason: str = Field(min_length=1)
