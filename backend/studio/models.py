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
    provider: Literal["fake", "higgsfield", "fal"] = "higgsfield"
    model: str = Field(default="gpt_image_2_5", min_length=1, pattern=r"^[a-zA-Z0-9_-]+$")
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


class BatchApprovalItem(Contract):
    recipe_id: str
    fingerprint: str = Field(min_length=64, max_length=64)
    max_credits: float = Field(ge=0, allow_inf_nan=False)


class BatchApproval(Contract):
    items: list[BatchApprovalItem] = Field(min_length=1, max_length=32)
    user_decision: str = Field(min_length=1)

    @model_validator(mode="after")
    def distinct_recipes(self):
        if len({item.recipe_id for item in self.items}) != len(self.items):
            raise ValueError("Batch recipes must be distinct")
        return self


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
    author: Literal["human", "assistant", "script"] = "human"
    expected_revision: int = Field(ge=0)
    expected_context: str = Field(min_length=64, max_length=64)
    status: Literal["approved", "rejected"]
    user_decision: str = Field(min_length=1)
    depicted_assets: list[str] = Field(default_factory=list)
    requirement_ids: list[str] = Field(default_factory=list)


DiscrepancyTag = Literal[
    "identity_drift", "wardrobe_mismatch", "prop_missing", "prop_extra", "location_mismatch",
    "state_mismatch", "instruction_not_followed", "count_wrong", "unreadable_text", "artifact",
    "copy_paste", "new_image_not_edit", "other",
]
EvaluationKind = Literal["judge", "facts", "similarity", "diversity", "duplicate", "stranger", "pairwise"]


class Evidence(Contract):
    question: str = Field(min_length=1, max_length=1000)
    answer: str = Field(max_length=1000)
    probability: float | None = Field(default=None, ge=0, le=1, allow_inf_nan=False)
    asset_id: str | None = None
    question_id: str | None = Field(default=None, max_length=200)
    region: str | None = Field(default=None, max_length=240)
    # A declared fact can be true and unseeable: a state written on a cut that shows the
    # subject from behind, a lock on a part the framing excludes. Guessing it either way is
    # worse than saying so, and an unanswered question is not the same as a lazy evaluator.
    not_visible: bool = False


class Discrepancy(Contract):
    tag: DiscrepancyTag
    asset_id: str | None = None
    region: str | None = Field(default=None, max_length=240)
    note: str = Field(min_length=1, max_length=1000)


class EvaluationCreate(Contract):
    """An observation about one exact image. It never sets review status; humans do that."""

    expected_context: str = Field(min_length=64, max_length=64)
    evaluator: str = Field(min_length=1, max_length=120)
    version: str = Field(min_length=1, max_length=120)
    kind: EvaluationKind
    scores: dict[str, float] = Field(default_factory=dict)
    evidence: list[Evidence] = Field(default_factory=list, max_length=200)
    confidence: float | None = Field(default=None, ge=0, le=1, allow_inf_nan=False)
    discrepancies: list[Discrepancy] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def unit_scores(self):
        for name, value in self.scores.items():
            if not (0.0 <= value <= 1.0):
                raise ValueError(f"Score {name} must be between 0 and 1")
        return self


class AssetRequirementCreate(Contract):
    kind: Literal["view", "state", "detail", "scale"]
    label: str = Field(min_length=1, max_length=120)
    instruction: str = Field(min_length=1, max_length=1000)
    priority: int = Field(default=1, ge=1, le=3)


class AssetRequirementUpdate(Contract):
    label: str = Field(min_length=1, max_length=120)
    instruction: str = Field(min_length=1, max_length=1000)
    priority: int = Field(ge=1, le=3)


class Reorder(Contract):
    kind: NodeKind
    ordered_ids: list[str] = Field(min_length=1)
    expected_revisions: dict[str, int]
    reason: str = Field(min_length=1)
