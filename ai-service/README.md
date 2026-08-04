# brieFFlow AI candidate service

This isolated Python service is the contract foundation for a LangGraph
candidate runtime. It does not replace PressTuner's current OpenAI Agents SDK
runtime, connect to production PostgreSQL, or perform an article write.

## Local verification

```bash
uv sync --project ai-service
uv run --project ai-service pytest
uv run --project ai-service ruff check ai-service
uv run --project ai-service uvicorn briefflow_ai.api:app --app-dir ai-service/src --reload
```

Open `http://127.0.0.1:8000/docs` for the versioned FastAPI contract.

## LangGraph debugging

From `ai-service`, run:

```bash
uv run langgraph dev
```

`langgraph.json` exposes `press_rag_candidate` for local graph inspection. The
workflow uses an in-memory checkpointer in this phase; restarting the process
removes all candidate runs.

LangSmith tracing is disabled unless explicitly configured. Use a dedicated
non-production project while the graph state contains a press topic:

```dotenv
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=...
LANGSMITH_PROJECT=briefflow-langgraph-candidate
```

The graph config propagates an application-generated operation UUID and safe
workflow dimensions. Never derive the product operation ID from a LangSmith
run ID.

## Container

```bash
docker build -t briefflow-ai-candidate ai-service
docker run --rm -p 8000:8000 briefflow-ai-candidate
```

The service intentionally starts without model, database, or observability
credentials. The next phase connects typed adapters to PressTuner's existing
retrieval, verification, approval, and persistence services.
