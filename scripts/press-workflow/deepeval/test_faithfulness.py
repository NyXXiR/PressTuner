"""Real pinned SDK over an offline HTTP transport; never a model-quality test."""
import json
import unittest
from unittest.mock import patch

import faithfulness
import httpx2 as httpx
from deepeval.metrics import FaithfulnessMetric  # Load native model classes before patching the client factory.
from deepeval.metrics.faithfulness.schema import Truths
from openai import OpenAI


INPUT = {"model": "gpt-4.1-mini", "user_input": "요청", "response": "출시일과 가격", "retrieved_contexts": ["출시일과 가격의 근거"]}


class FaithfulnessBridge(unittest.TestCase):
    def client_factory(self, requests):
        def respond(request):
            body = json.loads(request.content)
            requests.append(body)
            name = body["response_format"]["json_schema"]["name"]
            output = {
                "Truths": {"truths": ["출시일", "가격"]},
                "Claims": {"claims": ["출시일", "가격"]},
                "Verdicts": {"verdicts": [{"verdict": "yes"}, {"verdict": "no", "reason": "가격 불일치"}]},
                "FaithfulnessScoreReason": {"reason": "두 주장 중 가격이 근거와 모순됩니다."},
            }[name]
            return httpx.Response(200, json={
                "id": "offline-response", "object": "chat.completion", "created": 1, "model": INPUT["model"],
                "choices": [{"index": 0, "message": {"role": "assistant", "content": json.dumps(output)}, "finish_reason": "stop"}],
                "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
            })

        return lambda **kwargs: OpenAI(api_key="offline-contract-only", http_client=httpx.Client(transport=httpx.MockTransport(respond)), **kwargs)

    def test_native_structured_output_score_and_usage(self):
        requests = []
        with patch("openai.OpenAI", self.client_factory(requests)):
            result = faithfulness.evaluate(INPUT)
        self.assertEqual(result["score"], .5)
        self.assertIn("가격", result["reason"])
        self.assertEqual(len(requests), 4)
        self.assertEqual(result["usage"], {"inputTokens": 40, "outputTokens": 20})
        self.assertTrue(all(r["max_tokens"] == 3000 for r in requests))

    def test_structured_output_budget_blocks_ninth_request(self):
        class OverBudgetMetric:
            def __init__(self, model, **_kwargs):
                self.model = model

            def measure(self, *_args, **_kwargs):
                for _ in range(9):
                    self.model.generate("offline bound check", schema=Truths)
                self.score, self.reason = 1, "unreachable"

        requests = []
        with patch("openai.OpenAI", self.client_factory(requests)), patch("deepeval.metrics.FaithfulnessMetric", OverBudgetMetric):
            with self.assertRaisesRegex(ValueError, "PROVIDER_ERROR") as error:
                faithfulness.evaluate(INPUT)
        self.assertEqual(len(requests), 8)
        self.assertEqual(error.exception.measured_usage, {"inputTokens": 80, "outputTokens": 40})

    def test_luna_uses_bounded_non_reasoning_structured_requests(self):
        requests = []
        with patch("openai.OpenAI", self.client_factory(requests)):
            result = faithfulness.evaluate({**INPUT, "model": "gpt-6-luna"})
        self.assertEqual(result["score"], .5)
        self.assertEqual(result["usage"], {"inputTokens": 40, "outputTokens": 20})
        self.assertEqual(len(requests), 4)
        for request in requests:
            self.assertEqual(request["model"], "gpt-6-luna")
            self.assertEqual(request.get("reasoning_effort"), "none")
            self.assertEqual(request.get("max_completion_tokens"), 3000)
            self.assertEqual(request.get("temperature"), 0)
            self.assertNotIn("max_tokens", request)


if __name__ == "__main__":
    unittest.main()
