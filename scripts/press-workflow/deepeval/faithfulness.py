"""Built-in DeepEval FaithfulnessMetric; package prompt and score semantics unchanged."""
import contextlib
import importlib.metadata
import json
import math
import os
from pathlib import Path
import sys

os.environ["DEEPEVAL_TELEMETRY_OPT_OUT"] = "YES"
os.environ["DEEPEVAL_FILE_SYSTEM"] = "READ_ONLY"
os.environ["DEEPEVAL_RETRY_MAX_ATTEMPTS"] = "1"
os.environ["DEEPEVAL_PER_ATTEMPT_TIMEOUT_SECONDS"] = "30"
os.environ.pop("CONFIDENT_API_KEY", None)


def validate(value):
    if not isinstance(value, dict) or set(value) != {"model", "user_input", "response", "retrieved_contexts"}:
        raise ValueError("INVALID_RESULT")
    for key, limit in (("model", 120), ("user_input", 2000), ("response", 20000)):
        if not isinstance(value[key], str) or not value[key].strip() or len(value[key]) > limit:
            raise ValueError("INVALID_RESULT")
    contexts = value["retrieved_contexts"]
    if not isinstance(contexts, list) or not 1 <= len(contexts) <= 20 or any(not isinstance(c, str) or not c.strip() or len(c) > 3000 for c in contexts):
        raise ValueError("INVALID_RESULT")
    return value


def evaluate(value):
    from deepeval.metrics import FaithfulnessMetric
    from deepeval.models import OpenAIModel
    from deepeval.test_case import LLMTestCase
    from openai import OpenAI

    profile = json.loads((Path(__file__).resolve().parents[3] / "domain/press-workflow/evaluation/standard-profile.json").read_text(encoding="utf-8"))
    config = next(m for m in profile["metrics"] if m["framework"] == "DEEPEVAL")
    if importlib.metadata.version("deepeval") != config["version"]:
        raise ValueError("INVALID_RESULT")
    params = config["parameters"]
    overrides = profile["inference"]["modelOverrides"].get(value["model"], {})
    usage = {"inputTokens": 0, "outputTokens": 0}
    measured = False
    calls = 0
    with OpenAI(max_retries=0, timeout=30) as client:
        def bounded_completion(original):
            def call(*args, **kwargs):
                nonlocal calls, measured
                calls += 1
                if calls > 8:
                    raise ValueError("PROVIDER_ERROR")
                # The SDK omits temperature for Luna, but none reasoning supports it.
                if "max_completion_tokens" in overrides:
                    kwargs.pop("max_tokens", None)
                kwargs.update(overrides)
                response = original(*args, **kwargs)
                if response.usage:
                    measured = True
                    usage["inputTokens"] += response.usage.prompt_tokens
                    usage["outputTokens"] += response.usage.completion_tokens
                return response
            return call

        client.chat.completions.create = bounded_completion(client.chat.completions.create)
        # Native OpenAIModel uses parse() for structured outputs, bypassing create().
        client.beta.chat.completions.parse = bounded_completion(client.beta.chat.completions.parse)

        class BoundedModel(OpenAIModel):
            def load_model(self, async_mode=False):
                if async_mode:
                    raise ValueError("INVALID_RESULT")
                return client

        model = BoundedModel(model=value["model"], temperature=params["temperature"], generation_kwargs={"max_tokens": 3000})
        metric = FaithfulnessMetric(model=model, threshold=config["threshold"],
            **{k: params[k] for k in ("include_reason", "strict_mode", "penalize_ambiguous_claims", "truths_extraction_limit", "async_mode", "eval_mode")})
        case = LLMTestCase(input=value["user_input"], actual_output=value["response"], retrieval_context=value["retrieved_contexts"])
        try:
            metric.measure(case, _show_indicator=False)
            score = float(metric.score)
            if not math.isfinite(score) or not 0 <= score <= 1:
                raise ValueError("INVALID_RESULT")
            return {"score": score, "reason": str(metric.reason)[:4000] if metric.reason else None, "usage": usage if measured else None}
        except Exception as error:
            error.measured_usage = usage if measured else None
            raise


def main():
    try:
        raw = sys.stdin.buffer.read(131073)
        if len(raw) > 131072:
            raise ValueError("INVALID_RESULT")
        value = validate(json.loads(raw.decode("utf-8")))
        with contextlib.redirect_stdout(sys.stderr):
            result = evaluate(value)
        print(json.dumps({"ok": True, **result}, allow_nan=False))
    except Exception as error:
        code = "TIMEOUT" if "Timeout" in type(error).__name__ else "INVALID_RESULT" if isinstance(error, (ValueError, json.JSONDecodeError)) and str(error) == "INVALID_RESULT" else "PROVIDER_ERROR"
        print(json.dumps({"ok": False, "reasonCode": code, "usage": getattr(error, "measured_usage", None)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
