from __future__ import annotations

from collections.abc import Mapping, Sequence
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from briefflow_ai.api import create_app

FORBIDDEN_EXPORTED_KEYS = {
    "prompt",
    "prompts",
    "messages",
    "input",
    "output",
    "document",
    "documents",
    "content",
    "email",
    "name",
    "phone",
    "secret",
    "token",
    "authorization",
}


def start_payload(operation_id: UUID, source_refs: list[str]) -> dict[str, object]:
    return {
        "schemaVersion": "briefflow/langgraph-start/v1",
        "operationId": str(operation_id),
        "topic": "신제품 출시 보도자료",
        "tenantRef": "sha256:" + "1" * 64,
        "actorRef": "sha256:" + "2" * 64,
        "approvedSourceRefs": source_refs,
        "environment": "test",
    }


def assert_no_forbidden_keys(value: object) -> None:
    if isinstance(value, Mapping):
        for key, child in value.items():
            assert key.lower() not in FORBIDDEN_EXPORTED_KEYS
            assert_no_forbidden_keys(child)
    elif isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        for child in value:
            assert_no_forbidden_keys(child)


def test_run_pauses_for_approval_and_resumes_same_operation() -> None:
    client = TestClient(create_app())
    operation_id = uuid4()

    started = client.post(
        "/v1/workflows/press-rag/runs",
        json=start_payload(operation_id, ["source:product:1", "source:result:2"]),
    )

    assert started.status_code == 202
    waiting = started.json()
    assert waiting["operationId"] == str(operation_id)
    assert waiting["status"] == "WAITING_FOR_APPROVAL"
    assert waiting["approvalRequest"]["operationId"] == str(operation_id)
    assert waiting["applyRequest"] is None
    assert [event["sequence"] for event in waiting["events"]] == list(
        range(1, len(waiting["events"]) + 1)
    )
    assert waiting["opsOperation"]["operationId"] == str(operation_id)
    assert waiting["opsOperation"]["workflow"]["id"] == "press-tuner/article"
    assert waiting["opsOperation"]["comparison"]["role"] == "candidate"

    inspected = client.get(f"/v1/workflows/press-rag/runs/{operation_id}")
    assert inspected.status_code == 200
    assert inspected.json() == waiting

    resumed = client.post(
        f"/v1/workflows/press-rag/runs/{operation_id}/decisions",
        json={
            "schemaVersion": "briefflow/langgraph-decision/v1",
            "decision": "APPROVE",
            "reviewerRef": "sha256:" + "3" * 64,
        },
    )

    assert resumed.status_code == 200
    completed = resumed.json()
    assert completed["operationId"] == str(operation_id)
    assert completed["status"] == "COMPLETED"
    assert completed["applyRequest"]["operationId"] == str(operation_id)
    assert completed["applyRequest"]["sourceRefs"] == [
        "source:product:1",
        "source:result:2",
    ]
    assert completed["applyRequest"]["proposalRef"].startswith("sha256:")
    assert completed["opsOperation"]["timing"]["completedAt"] is not None
    assert_no_forbidden_keys(completed["events"])
    assert_no_forbidden_keys(completed["opsOperation"])


def test_insufficient_evidence_stops_without_approval_or_apply_request() -> None:
    client = TestClient(create_app())
    operation_id = uuid4()

    response = client.post(
        "/v1/workflows/press-rag/runs",
        json=start_payload(operation_id, []),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "INSUFFICIENT_EVIDENCE"
    assert body["approvalRequest"] is None
    assert body["applyRequest"] is None
    assert body["opsOperation"]["timing"]["completedAt"] is not None
    assert body["events"][-1]["nodeId"] == "insufficient_evidence"


def test_rejection_terminates_without_apply_request() -> None:
    client = TestClient(create_app())
    operation_id = uuid4()
    response = client.post(
        "/v1/workflows/press-rag/runs",
        json=start_payload(operation_id, ["source:product:1"]),
    )
    assert response.status_code == 202

    rejected = client.post(
        f"/v1/workflows/press-rag/runs/{operation_id}/decisions",
        json={
            "schemaVersion": "briefflow/langgraph-decision/v1",
            "decision": "REJECT",
            "reviewerRef": "sha256:" + "3" * 64,
        },
    )

    assert rejected.status_code == 200
    body = rejected.json()
    assert body["status"] == "REJECTED"
    assert body["applyRequest"] is None
    assert body["events"][-1]["nodeId"] == "rejected"


def test_duplicate_operation_and_decision_for_unknown_operation_are_rejected() -> None:
    client = TestClient(create_app())
    operation_id = uuid4()
    payload = start_payload(operation_id, ["source:product:1"])

    assert client.post("/v1/workflows/press-rag/runs", json=payload).status_code == 202
    duplicate = client.post("/v1/workflows/press-rag/runs", json=payload)
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"]["code"] == "OPERATION_ALREADY_EXISTS"

    unknown = client.post(
        f"/v1/workflows/press-rag/runs/{uuid4()}/decisions",
        json={
            "schemaVersion": "briefflow/langgraph-decision/v1",
            "decision": "APPROVE",
            "reviewerRef": "sha256:" + "3" * 64,
        },
    )
    assert unknown.status_code == 404
    assert unknown.json()["detail"]["code"] == "OPERATION_NOT_FOUND"


def test_contract_rejects_invalid_identifiers_and_direct_actor_identity() -> None:
    client = TestClient(create_app())
    payload = start_payload(uuid4(), ["source:product:1"])
    payload["operationId"] = "not-a-uuid"
    payload["actorRef"] = "reporter@example.com"

    response = client.post("/v1/workflows/press-rag/runs", json=payload)

    assert response.status_code == 422


def test_contract_rejects_unsafe_source_reference() -> None:
    client = TestClient(create_app())
    payload = start_payload(uuid4(), ["https://example.test/?token=secret"])

    response = client.post("/v1/workflows/press-rag/runs", json=payload)

    assert response.status_code == 422
