from __future__ import annotations

import hashlib
import json
import operator
from datetime import UTC, datetime
from typing import Annotated, Any, Literal, TypedDict
from uuid import UUID, uuid4

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt

from .models import ReviewDecision

WORKFLOW_ID = "press-tuner/article"
WORKFLOW_VERSION = "langgraph-candidate-v1"


class PressWorkflowState(TypedDict):
    operation_id: str
    topic: str
    tenant_ref: str
    actor_ref: str
    environment: str
    approved_source_refs: list[str]
    sequence: int
    events: Annotated[list[dict[str, Any]], operator.add]
    status: str
    started_at: str
    completed_at: str | None
    proposal_ref: str | None
    decision: str | None
    reviewer_ref: str | None
    apply_request: dict[str, Any] | None


def utc_now() -> datetime:
    return datetime.now(UTC)


def build_graph_config(
    *, operation_id: UUID, tenant_ref: str, environment: str
) -> dict[str, Any]:
    return {
        "configurable": {"thread_id": str(operation_id)},
        "metadata": {
            "operation_id": str(operation_id),
            "workflow_id": WORKFLOW_ID,
            "workflow_version": WORKFLOW_VERSION,
            "project_id": "press-tuner",
            "environment": environment,
            "tenant_ref": tenant_ref,
        },
        "run_name": f"{WORKFLOW_ID}:{WORKFLOW_VERSION}",
        "tags": ["press-tuner", "candidate", environment],
    }


def _event(
    state: PressWorkflowState,
    *,
    node_id: str,
    transition_type: Literal[
        "SEQUENCE", "BRANCH", "GUARD", "RETRY", "HUMAN_REVIEW", "TERMINAL"
    ],
    execution_state: Literal["SUCCEEDED", "BLOCKED", "FAILED"] = "SUCCEEDED",
    human_review: Literal["NONE", "PENDING", "RESOLVED"] = "NONE",
) -> dict[str, Any]:
    return {
        "schema_version": "briefflow/execution-event/v1",
        "event_id": str(uuid4()),
        "operation_id": state["operation_id"],
        "sequence": state["sequence"] + 1,
        "node_id": node_id,
        "execution_state": execution_state,
        "transition_type": transition_type,
        "occurred_at": utc_now().isoformat(),
        "latency_ms": 0,
        "retry_count": 0,
        "error_code": None,
        "evidence_ref_count": len(state["approved_source_refs"]),
        "human_review": human_review,
    }


def _record(
    state: PressWorkflowState,
    *,
    node_id: str,
    transition_type: Literal[
        "SEQUENCE", "BRANCH", "GUARD", "RETRY", "HUMAN_REVIEW", "TERMINAL"
    ],
    execution_state: Literal["SUCCEEDED", "BLOCKED", "FAILED"] = "SUCCEEDED",
    human_review: Literal["NONE", "PENDING", "RESOLVED"] = "NONE",
    **updates: Any,
) -> dict[str, Any]:
    event = _event(
        state,
        node_id=node_id,
        transition_type=transition_type,
        execution_state=execution_state,
        human_review=human_review,
    )
    return {"sequence": event["sequence"], "events": [event], **updates}


def _intake(state: PressWorkflowState) -> dict[str, Any]:
    return _record(state, node_id="intake", transition_type="SEQUENCE")


def _plan(state: PressWorkflowState) -> dict[str, Any]:
    return _record(state, node_id="plan", transition_type="SEQUENCE")


def _retrieve(state: PressWorkflowState) -> dict[str, Any]:
    return _record(state, node_id="retrieve", transition_type="SEQUENCE")


def _verify_evidence(state: PressWorkflowState) -> dict[str, Any]:
    return _record(state, node_id="verify_evidence", transition_type="GUARD")


def _route_evidence(
    state: PressWorkflowState,
) -> Literal["prepare_review", "insufficient_evidence"]:
    return (
        "prepare_review"
        if state["approved_source_refs"]
        else "insufficient_evidence"
    )


def _proposal_ref(state: PressWorkflowState) -> str:
    canonical = json.dumps(
        {
            "topic": state["topic"],
            "source_refs": state["approved_source_refs"],
            "workflow_version": WORKFLOW_VERSION,
        },
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    return "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _prepare_review(state: PressWorkflowState) -> dict[str, Any]:
    return _record(
        state,
        node_id="prepare_review",
        transition_type="BRANCH",
        status="WAITING_FOR_APPROVAL",
        proposal_ref=_proposal_ref(state),
    )


def _human_review(state: PressWorkflowState) -> dict[str, Any]:
    resolution = interrupt(
        {
            "kind": "APPROVAL_REQUIRED",
            "operation_id": state["operation_id"],
            "proposal_ref": state["proposal_ref"],
        }
    )
    return _record(
        state,
        node_id="human_review",
        transition_type="HUMAN_REVIEW",
        human_review="RESOLVED",
        decision=resolution["decision"],
        reviewer_ref=resolution["reviewer_ref"],
    )


def _route_decision(state: PressWorkflowState) -> Literal["approved", "rejected"]:
    return "approved" if state["decision"] == ReviewDecision.APPROVE else "rejected"


def _approved(state: PressWorkflowState) -> dict[str, Any]:
    return _record(
        state,
        node_id="approved",
        transition_type="TERMINAL",
        status="COMPLETED",
        completed_at=utc_now().isoformat(),
        apply_request={
            "operation_id": state["operation_id"],
            "proposal_ref": state["proposal_ref"],
            "source_refs": state["approved_source_refs"],
        },
    )


def _rejected(state: PressWorkflowState) -> dict[str, Any]:
    return _record(
        state,
        node_id="rejected",
        transition_type="TERMINAL",
        status="REJECTED",
        completed_at=utc_now().isoformat(),
    )


def _insufficient_evidence(state: PressWorkflowState) -> dict[str, Any]:
    return _record(
        state,
        node_id="insufficient_evidence",
        transition_type="TERMINAL",
        status="INSUFFICIENT_EVIDENCE",
        completed_at=utc_now().isoformat(),
    )


def build_press_workflow(*, checkpointer: InMemorySaver | None = None):
    builder = StateGraph(PressWorkflowState)
    builder.add_node("intake", _intake)
    builder.add_node("plan", _plan)
    builder.add_node("retrieve", _retrieve)
    builder.add_node("verify_evidence", _verify_evidence)
    builder.add_node("prepare_review", _prepare_review)
    builder.add_node("human_review", _human_review)
    builder.add_node("approved", _approved)
    builder.add_node("rejected", _rejected)
    builder.add_node("insufficient_evidence", _insufficient_evidence)
    builder.add_edge(START, "intake")
    builder.add_edge("intake", "plan")
    builder.add_edge("plan", "retrieve")
    builder.add_edge("retrieve", "verify_evidence")
    builder.add_conditional_edges("verify_evidence", _route_evidence)
    builder.add_edge("prepare_review", "human_review")
    builder.add_conditional_edges("human_review", _route_decision)
    builder.add_edge("approved", END)
    builder.add_edge("rejected", END)
    builder.add_edge("insufficient_evidence", END)
    if checkpointer is None:
        return builder.compile()
    return builder.compile(checkpointer=checkpointer)


def resume_command(*, decision: ReviewDecision, reviewer_ref: str) -> Command:
    return Command(
        resume={"decision": decision.value, "reviewer_ref": reviewer_ref}
    )
