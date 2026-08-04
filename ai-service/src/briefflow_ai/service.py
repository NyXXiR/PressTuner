from __future__ import annotations

from datetime import UTC, datetime
from threading import RLock
from typing import Any
from uuid import UUID

from langgraph.checkpoint.memory import InMemorySaver

from .models import (
    ApplyRequest,
    ApprovalRequest,
    ExecutionEvent,
    OperationActor,
    OperationComparison,
    OperationScope,
    OperationTiming,
    OpsOperation,
    PressWorkflowDecisionRequest,
    PressWorkflowResponse,
    StartPressWorkflowRequest,
    WorkflowIdentity,
    WorkflowStatus,
)
from .workflow import build_graph_config, build_press_workflow, resume_command


class OperationAlreadyExistsError(RuntimeError):
    pass


class OperationNotFoundError(RuntimeError):
    pass


class OperationNotWaitingError(RuntimeError):
    pass


class PressWorkflowService:
    def __init__(self) -> None:
        self._checkpointer = InMemorySaver()
        self._graph = build_press_workflow(checkpointer=self._checkpointer)
        self._requests: dict[UUID, StartPressWorkflowRequest] = {}
        self._responses: dict[UUID, PressWorkflowResponse] = {}
        self._lock = RLock()

    def start(self, request: StartPressWorkflowRequest) -> PressWorkflowResponse:
        with self._lock:
            if request.operation_id in self._requests:
                raise OperationAlreadyExistsError
            source_refs = request.normalized_source_refs()
            started_at = datetime.now(UTC)
            initial_state = {
                "operation_id": str(request.operation_id),
                "topic": request.topic,
                "tenant_ref": request.tenant_ref,
                "actor_ref": request.actor_ref,
                "environment": request.environment,
                "approved_source_refs": source_refs,
                "sequence": 0,
                "events": [],
                "status": "RUNNING",
                "started_at": started_at.isoformat(),
                "completed_at": None,
                "proposal_ref": None,
                "decision": None,
                "reviewer_ref": None,
                "apply_request": None,
            }
            state = self._graph.invoke(
                initial_state,
                build_graph_config(
                    operation_id=request.operation_id,
                    tenant_ref=request.tenant_ref,
                    environment=request.environment,
                ),
            )
            response = self._response(request=request, state=state)
            self._requests[request.operation_id] = request
            self._responses[request.operation_id] = response
            return response

    def decide(
        self, operation_id: UUID, decision: PressWorkflowDecisionRequest
    ) -> PressWorkflowResponse:
        with self._lock:
            request = self._requests.get(operation_id)
            if request is None:
                raise OperationNotFoundError
            previous = self._responses[operation_id]
            if previous.status != WorkflowStatus.WAITING_FOR_APPROVAL:
                raise OperationNotWaitingError
            state = self._graph.invoke(
                resume_command(
                    decision=decision.decision,
                    reviewer_ref=decision.reviewer_ref,
                ),
                build_graph_config(
                    operation_id=operation_id,
                    tenant_ref=request.tenant_ref,
                    environment=request.environment,
                ),
            )
            response = self._response(request=request, state=state)
            self._responses[operation_id] = response
            return response

    def get(self, operation_id: UUID) -> PressWorkflowResponse:
        with self._lock:
            response = self._responses.get(operation_id)
            if response is None:
                raise OperationNotFoundError
            return response

    def _response(
        self, *, request: StartPressWorkflowRequest, state: dict[str, Any]
    ) -> PressWorkflowResponse:
        status = WorkflowStatus(state["status"])
        proposal_ref = state.get("proposal_ref")
        approval_request = (
            ApprovalRequest(
                operation_id=request.operation_id,
                proposal_ref=proposal_ref,
                source_ref_count=len(state["approved_source_refs"]),
            )
            if status == WorkflowStatus.WAITING_FOR_APPROVAL and proposal_ref
            else None
        )
        raw_apply = state.get("apply_request")
        apply_request = ApplyRequest.model_validate(raw_apply) if raw_apply else None
        started_at = datetime.fromisoformat(state["started_at"])
        completed_at = (
            datetime.fromisoformat(state["completed_at"])
            if state.get("completed_at")
            else None
        )
        ops_operation = OpsOperation(
            operation_id=request.operation_id,
            workflow=WorkflowIdentity(),
            scope=OperationScope(
                tenant_ref=request.tenant_ref,
                environment=request.environment,
            ),
            actor=OperationActor(reference=request.actor_ref),
            timing=OperationTiming(
                started_at=started_at,
                completed_at=completed_at,
            ),
            registered_at=started_at,
            comparison=OperationComparison(),
        )
        return PressWorkflowResponse(
            operation_id=request.operation_id,
            status=status,
            events=[ExecutionEvent.model_validate(item) for item in state["events"]],
            approval_request=approval_request,
            apply_request=apply_request,
            ops_operation=ops_operation,
        )
