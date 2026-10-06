"""Bounded JSON-lines bridge to the official Ragas Faithfulness implementation."""
import asyncio
import contextlib
import importlib.metadata
import json
import math
import os
import sys
import time

os.environ["RAGAS_DO_NOT_TRACK"] = "true"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"


def validate(value):
    if not isinstance(value, dict) or set(value) != {"user_input", "response", "retrieved_contexts", "model"}:
        raise ValueError("INVALID_RESULT")
    for key, maximum in (("user_input", 2000), ("response", 20000), ("model", 120)):
        if not isinstance(value[key], str) or not value[key].strip() or len(value[key]) > maximum:
            raise ValueError("INVALID_RESULT")
    contexts = value["retrieved_contexts"]
    if not isinstance(contexts, list) or not 1 <= len(contexts) <= 20 or any(not isinstance(v, str) or not v.strip() or len(v) > 3000 for v in contexts):
        raise ValueError("INVALID_RESULT")
    return value


async def evaluate(value):
    from openai import AsyncOpenAI
    from ragas.llms import llm_factory
    from ragas.metrics.collections import Faithfulness
    if importlib.metadata.version("ragas") != "0.4.3":
        raise ValueError("INVALID_RESULT")
    usage = {"inputTokens": 0, "outputTokens": 0}
    measured_usage = False
    calls = 0
    async with AsyncOpenAI(max_retries=0, timeout=35) as client:
        original = client.chat.completions.create

        async def bounded_create(*args, **kwargs):
            nonlocal calls, measured_usage
            calls += 1
            if calls > 4:
                raise ValueError("PROVIDER_ERROR")
            kwargs["max_tokens"] = 3000
            result = await original(*args, **kwargs)
            if result.usage:
                measured_usage = True
                usage["inputTokens"] += result.usage.prompt_tokens
                usage["outputTokens"] += result.usage.completion_tokens
            return result

        client.chat.completions.create = bounded_create
        llm = llm_factory(value["model"], client=client, temperature=0)
        scorer = Faithfulness(llm=llm)
        try:
            result = await asyncio.wait_for(scorer.ascore(user_input=value["user_input"], response=value["response"], retrieved_contexts=value["retrieved_contexts"]), timeout=90)
            score = float(result.value)
            if not math.isfinite(score):
                raise ValueError("NO_CLAIMS")
            if not 0 <= score <= 1:
                raise ValueError("INVALID_RESULT")
            return {"score": score, "usage": usage if measured_usage else None}
        except Exception as error:
            error.measured_usage = usage if measured_usage else None
            raise


def main():
    started = time.monotonic()
    try:
        raw = sys.stdin.buffer.read(131073)
        if len(raw) > 131072:
            raise ValueError("INVALID_RESULT")
        value = validate(json.loads(raw.decode("utf-8")))
        # Libraries must not interleave logs with the protocol or expose provider errors.
        with contextlib.redirect_stdout(sys.stderr):
            result = asyncio.run(evaluate(value))
        print(json.dumps({"ok": True, **result}, allow_nan=False))
    except Exception as error:
        code = "TIMEOUT" if isinstance(error, (TimeoutError, asyncio.TimeoutError)) else str(error)
        if code not in {"INVALID_RESULT", "NO_CLAIMS", "TIMEOUT"}:
            code = "PROVIDER_ERROR"
        print(json.dumps({"ok": False, "reasonCode": code, "usage": getattr(error, "measured_usage", None), "elapsedMs": int((time.monotonic() - started) * 1000)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
