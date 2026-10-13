"""Pinned Ragas/OpenAI SDK wire compatibility; no paid calls or quality claims."""
import asyncio
import json
import unittest
from unittest.mock import patch

import evaluate
import httpx
from openai import AsyncOpenAI
from ragas.llms import llm_factory  # Initialize SDK integration before patching.


class RagasRequests(unittest.TestCase):
    def test_luna_and_legacy_requests_keep_score_and_usage(self):
        for model in ("gpt-6-luna", "gpt-4.1-mini"):
            with self.subTest(model=model):
                requests = []

                def respond(request):
                    requests.append(json.loads(request.content))
                    output = {"statements": ["가격은 100원이다."]} if len(requests) == 1 else {
                        "statements": [{"statement": "가격은 100원이다.", "reason": "근거와 일치", "verdict": 1}]}
                    return httpx.Response(200, json={
                        "id": "offline-response", "object": "chat.completion", "created": 1, "model": model,
                        "choices": [{"index": 0, "message": {"role": "assistant", "content": json.dumps(output)}, "finish_reason": "stop"}],
                        "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
                    })

                class OfflineAsyncOpenAI(AsyncOpenAI):
                    def __init__(self, **kwargs):
                        super().__init__(api_key="offline-contract-only", http_client=httpx.AsyncClient(transport=httpx.MockTransport(respond)), **kwargs)

                with patch("openai.AsyncOpenAI", OfflineAsyncOpenAI):
                    result = asyncio.run(evaluate.evaluate({"model": model, "user_input": "가격 안내", "response": "가격은 100원이다.", "retrieved_contexts": ["가격은 100원이다."]}))
                self.assertEqual(result["score"], 1)
                self.assertEqual(result["usage"], {"inputTokens": 20, "outputTokens": 10})
                self.assertEqual(len(requests), 2)
                for request in requests:
                    self.assertEqual(request["model"], model)
                    self.assertEqual(request["temperature"], 0)
                    if model == "gpt-6-luna":
                        self.assertEqual(request.get("reasoning_effort"), "none")
                        self.assertEqual(request.get("max_completion_tokens"), 3000)
                        self.assertNotIn("max_tokens", request)
                    else:
                        self.assertEqual(request["max_tokens"], 3000)
                        self.assertNotIn("reasoning_effort", request)


if __name__ == "__main__":
    unittest.main()
