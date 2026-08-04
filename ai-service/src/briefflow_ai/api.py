from __future__ import annotations

from uuid import UUID

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse

from .models import (
    PressWorkflowDecisionRequest,
    PressWorkflowResponse,
    StartPressWorkflowRequest,
)
from .service import (
    OperationAlreadyExistsError,
    OperationNotFoundError,
    OperationNotWaitingError,
    PressWorkflowService,
)


def _json_response(response, *, status_code: int) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=response.model_dump(mode="json", by_alias=True),
    )


def create_app(*, service: PressWorkflowService | None = None) -> FastAPI:
    workflow_service = service or PressWorkflowService()
    app = FastAPI(
        title="brieFFlow AI candidate service",
        version="0.1.0",
        description=(
            "Deterministic LangGraph contract foundation. Product writes remain "
            "owned by the PressTuner application."
        ),
    )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "runtime": "langgraph-candidate-v1"}

    @app.post(
        "/v1/workflows/press-rag/runs",
        response_model=PressWorkflowResponse,
        responses={202: {"model": PressWorkflowResponse}},
    )
    def start_workflow(request: StartPressWorkflowRequest):
        try:
            response = workflow_service.start(request)
        except OperationAlreadyExistsError as error:
            raise HTTPException(
                status_code=409,
                detail={"code": "OPERATION_ALREADY_EXISTS"},
            ) from error
        status_code = 202 if response.status == "WAITING_FOR_APPROVAL" else 200
        return _json_response(response, status_code=status_code)

    @app.post(
        "/v1/workflows/press-rag/runs/{operation_id}/decisions",
        response_model=PressWorkflowResponse,
    )
    def decide_workflow(
        operation_id: UUID, request: PressWorkflowDecisionRequest
    ):
        try:
            response = workflow_service.decide(operation_id, request)
        except OperationNotFoundError as error:
            raise HTTPException(
                status_code=404,
                detail={"code": "OPERATION_NOT_FOUND"},
            ) from error
        except OperationNotWaitingError as error:
            raise HTTPException(
                status_code=409,
                detail={"code": "OPERATION_NOT_WAITING_FOR_APPROVAL"},
            ) from error
        return _json_response(response, status_code=200)

    @app.get(
        "/v1/workflows/press-rag/runs/{operation_id}",
        response_model=PressWorkflowResponse,
    )
    def get_workflow(operation_id: UUID):
        try:
            response = workflow_service.get(operation_id)
        except OperationNotFoundError as error:
            raise HTTPException(
                status_code=404,
                detail={"code": "OPERATION_NOT_FOUND"},
            ) from error
        return _json_response(response, status_code=200)

    return app


app = create_app()
