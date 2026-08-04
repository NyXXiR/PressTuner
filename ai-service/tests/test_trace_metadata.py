from uuid import uuid4

from briefflow_ai.workflow import build_graph_config


def test_graph_config_uses_application_operation_id_and_safe_dimensions() -> None:
    operation_id = uuid4()

    config = build_graph_config(
        operation_id=operation_id,
        tenant_ref="sha256:" + "1" * 64,
        environment="test",
    )

    assert config["configurable"]["thread_id"] == str(operation_id)
    assert config["metadata"] == {
        "operation_id": str(operation_id),
        "workflow_id": "press-tuner/article",
        "workflow_version": "langgraph-candidate-v1",
        "project_id": "press-tuner",
        "environment": "test",
        "tenant_ref": "sha256:" + "1" * 64,
    }
    assert config["run_name"] == "press-tuner/article:langgraph-candidate-v1"
    assert config["tags"] == ["press-tuner", "candidate", "test"]
