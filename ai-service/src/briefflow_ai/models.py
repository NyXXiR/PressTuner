from __future__ import annotations

import re
from datetime import datetime
from enum import StrEnum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

HASHED_REF_PATTERN = r"^sha256:[0-9a-f]{64}$"
SAFE_REF_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9:._/-]{0,199}$"


class ContractModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
    )


class WorkflowStatus(StrEnum):
    WAITING_FOR_APPROVAL = "WAITING_FOR_APPROVAL"
    COMPLETED = "COMPLETED"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"
    REJECTED = "REJECTED"


class ReviewDecision(StrEnum):
    APPROVE = "APPROVE"
    REJECT = "REJECT"


class StartPressWorkflowRequest(ContractModel):
    schema_version: Literal["briefflow/langgraph-start/v1"]
    operation_id: UUID
    topic: str = Field(min_length=1, max_length=500)
    tenant_ref: str = Field(pattern=HASHED_REF_PATTERN)
    actor_ref: str = Field(pattern=HASHED_REF_PATTERN)
    approved_source_refs: list[str] = Field(default_factory=list, max_length=50)
    environment: str = Field(pattern=r"^[a-z][a-z0-9_-]{0,39}$")

    @field_validator("approved_source_refs")
    @classmethod
    def validate_source_refs(cls, values: list[str]) -> list[str]:
        refs = list(dict.fromkeys(value.strip() for value in values if value.strip()))
        if any(len(ref) > 200 or not re.fullmatch(SAFE_REF_PATTERN, ref) for ref in refs):
            raise ValueError("approved source reference is not safe")
        return refs

    def normalized_source_refs(self) -> list[str]:
        return list(self.approved_source_refs)


class PressWorkflowDecisionRequest(ContractModel):
    schema_version: Literal["briefflow/langgraph-decision/v1"]
    decision: ReviewDecision
    reviewer_ref: str = Field(pattern=HASHED_REF_PATTERN)


class ExecutionEvent(ContractModel):
    schema_version: Literal["briefflow/execution-event/v1"] = (
        "briefflow/execution-event/v1"
    )
    event_id: UUID
    operation_id: UUID
    sequence: int = Field(gt=0)
    node_id: str = Field(pattern=r"^[a-z][a-z0-9_]{0,79}$")
    execution_state: Literal["SUCCEEDED", "BLOCKED", "FAILED"]
    transition_type: Literal[
        "SEQUENCE", "BRANCH", "GUARD", "RETRY", "HUMAN_REVIEW", "TERMINAL"
    ]
    occurred_at: datetime
    latency_ms: int = Field(ge=0)
    retry_count: int = Field(ge=0)
    error_code: str | None = Field(default=None, pattern=r"^[A-Z0-9_.-]+$")
    evidence_ref_count: int = Field(ge=0)
    human_review: Literal["NONE", "PENDING", "RESOLVED"]


class ApprovalRequest(ContractModel):
    operation_id: UUID
    proposal_ref: str = Field(pattern=HASHED_REF_PATTERN)
    source_ref_count: int = Field(gt=0)


class ApplyRequest(ContractModel):
    operation_id: UUID
    proposal_ref: str = Field(pattern=HASHED_REF_PATTERN)
    source_refs: list[str]


class WorkflowIdentity(ContractModel):
    id: Literal["press-tuner/article"] = "press-tuner/article"
    version: Literal["langgraph-candidate-v1"] = "langgraph-candidate-v1"


class OperationScope(ContractModel):
    tenant_ref: str = Field(pattern=HASHED_REF_PATTERN)
    project_id: Literal["press-tuner"] = "press-tuner"
    environment: str


class OperationActor(ContractModel):
    type: Literal["human"] = "human"
    reference: str = Field(pattern=HASHED_REF_PATTERN)


class OperationTiming(ContractModel):
    started_at: datetime
    completed_at: datetime | None


class OperationComparison(ContractModel):
    cohort_id: Literal["press-rag-runtime-v1"] = "press-rag-runtime-v1"
    role: Literal["candidate"] = "candidate"


class OpsOperation(ContractModel):
    schema_version: Literal["ops-console/operation/v1"] = (
        "ops-console/operation/v1"
    )
    operation_id: UUID
    workflow: WorkflowIdentity
    scope: OperationScope
    actor: OperationActor
    timing: OperationTiming
    registered_at: datetime
    comparison: OperationComparison


class PressWorkflowResponse(ContractModel):
    schema_version: Literal["briefflow/langgraph-run/v1"] = (
        "briefflow/langgraph-run/v1"
    )
    operation_id: UUID
    status: WorkflowStatus
    events: list[ExecutionEvent]
    approval_request: ApprovalRequest | None
    apply_request: ApplyRequest | None
    ops_operation: OpsOperation
