"""Official DeepEval G-Eval with fixed steps/rubric; bounded, local JSON bridge."""
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
RUBRIC = json.loads(Path(__file__).with_name("rubric.json").read_text(encoding="utf-8"))


def validate(value):
    fields = {"model", "request", "draft", "facts", "requiredFactIds", "requestedStyle", "styleExamples"}
    if not isinstance(value, dict) or set(value) not in (fields, fields | {"criteria"}):
        raise ValueError("INVALID_RESULT")
    criteria = value.get("criteria", list(RUBRIC["criteria"]))
    if not isinstance(criteria, list) or not criteria or any(not isinstance(c, str) or c not in RUBRIC["criteria"] for c in criteria) or len(set(criteria)) != len(criteria):
        raise ValueError("INVALID_RESULT")
    for key, limit in (("model", 120), ("request", 2000), ("draft", 20000), ("requestedStyle", 500), ("styleExamples", 3000)):
        needed = key not in ("requestedStyle", "styleExamples") or (key == "requestedStyle" and "REQUESTED_STYLE" in criteria) or (key == "styleExamples" and "STYLE_LEAKAGE" in criteria)
        if not isinstance(value[key], str) or (needed and not value[key].strip()) or len(value[key]) > limit:
            raise ValueError("INVALID_RESULT")
    facts = value["facts"]
    if not isinstance(facts, list) or not 1 <= len(facts) <= 20:
        raise ValueError("INVALID_RESULT")
    for fact in facts:
        if not isinstance(fact, dict) or set(fact) != {"id", "content"} or any(not isinstance(fact[k], str) or not fact[k].strip() or len(fact[k]) > limit for k, limit in (("id", 60), ("content", 3000))):
            raise ValueError("INVALID_RESULT")
    ids = {f["id"] for f in facts}
    required = value["requiredFactIds"]
    if len(ids) != len(facts) or not isinstance(required, list) or ("REQUIRED_FACTS" in criteria and not required) or len(required) > 20 or any(not isinstance(x, str) or x not in ids for x in required) or len(set(required)) != len(required):
        raise ValueError("INVALID_RESULT")
    return value


def make_metric(criterion, model):
    from deepeval.metrics import GEval
    from deepeval.metrics.g_eval import Rubric
    from deepeval.test_case import SingleTurnParams
    return GEval(name=criterion, model=model, evaluation_steps=[RUBRIC["criteria"][criterion], *RUBRIC["commonSteps"]],
                 evaluation_params=[SingleTurnParams.INPUT, SingleTurnParams.ACTUAL_OUTPUT, SingleTurnParams.EXPECTED_OUTPUT],
                 rubric=[Rubric(**r) for r in RUBRIC["rubric"]], threshold=RUBRIC["threshold"], async_mode=False, verbose_mode=False)


def evaluate(value):
    from deepeval.models import OpenAIModel
    from deepeval.test_case import LLMTestCase
    from openai import OpenAI
    if importlib.metadata.version("deepeval") != "4.2.8":
        raise ValueError("INVALID_RESULT")
    usage = {"inputTokens": 0, "outputTokens": 0}
    measured = False
    calls = 0
    with OpenAI(max_retries=0, timeout=30) as client:
        original = client.chat.completions.create

        def bounded_create(*args, **kwargs):
            nonlocal calls, measured
            calls += 1
            if calls > 2 * len(value.get("criteria", RUBRIC["criteria"])):
                raise ValueError("PROVIDER_ERROR")
            result = original(*args, **kwargs)
            if result.usage:
                measured = True
                usage["inputTokens"] += result.usage.prompt_tokens
                usage["outputTokens"] += result.usage.completion_tokens
            return result

        client.chat.completions.create = bounded_create

        class BoundedModel(OpenAIModel):
            def load_model(self, async_mode=False):
                if async_mode:
                    raise ValueError("INVALID_RESULT")
                return client

        model = BoundedModel(model=value["model"], temperature=0, generation_kwargs={"max_tokens": 1800})
        expected = {k: value[k] for k in ("facts", "requiredFactIds", "requestedStyle", "styleExamples")}
        case = LLMTestCase(input=value["request"], actual_output=value["draft"], expected_output=json.dumps(expected, ensure_ascii=False))
        checks = []
        for criterion in value.get("criteria", RUBRIC["criteria"]):
            try:
                metric = make_metric(criterion, model)
                metric.measure(case, _show_indicator=False)
                score = float(metric.score)
                if not math.isfinite(score) or not 0 <= score <= 1 or not metric.reason:
                    raise ValueError("INVALID_RESULT")
                # G-Eval reasons are observations, not structured evidence. Do not fabricate spans.
                checks.append({"criterion": criterion, "judgment": "PASS" if score >= RUBRIC["threshold"] else "FAIL",
                               "score": score, "reason": metric.reason[:800], "evidence": []})
            except Exception as error:
                code = "TIMEOUT" if "Timeout" in type(error).__name__ else "INVALID_RESULT" if str(error) == "INVALID_RESULT" else "PROVIDER_ERROR"
                checks.append({"criterion": criterion, "judgment": "UNCERTAIN", "reason": "평가 실행에 실패했습니다. 정상 판정이 아닙니다.", "evidence": [], "errorCode": code})
        return {"checks": checks, "usage": usage if measured else None}


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
        code = "INVALID_RESULT" if isinstance(error, (ValueError, json.JSONDecodeError)) else "PROVIDER_ERROR"
        print(json.dumps({"ok": False, "reasonCode": code, "usage": None}))
        sys.exit(1)


if __name__ == "__main__":
    main()
