import unittest
from evaluate import validate, make_metric, RUBRIC
from deepeval.models import DeepEvalBaseLLM
from deepeval.test_case import LLMTestCase


class FixtureModel(DeepEvalBaseLLM):
    """Offline SDK contract only; deliberately not a model-quality test."""
    def load_model(self):
        return self

    def generate(self, prompt, schema=None):
        return schema(score=2, reason="합성 계약 검사")

    async def a_generate(self, prompt, schema=None):
        return self.generate(prompt, schema)

    def get_model_name(self):
        return "synthetic-contract"


class AdapterContract(unittest.TestCase):
    def test_input_validation(self):
        valid = {"model": "test", "request": "요청", "draft": "초안", "facts": [{"id": "f1", "content": "근거"}], "requiredFactIds": ["f1"], "requestedStyle": "문체", "styleExamples": "예시"}
        self.assertEqual(validate(valid), valid)
        for invalid in ({**valid, "secret": "no"}, {**valid, "requiredFactIds": ["unknown"]}, {**valid, "draft": "x" * 20001}):
            with self.assertRaises(ValueError):
                validate(invalid)

    def test_official_geval_executes_fixed_rubric(self):
        for criterion in RUBRIC["criteria"]:
            metric = make_metric(criterion, FixtureModel())
            metric.measure(LLMTestCase(input="요청", actual_output="초안", expected_output="근거"), _show_indicator=False)
            self.assertAlmostEqual(metric.score, .2)
            self.assertFalse(metric.is_successful())
            self.assertEqual(len(metric.evaluation_steps), 4)

    def test_selected_criteria_require_only_their_actual_inputs(self):
        partial = {"model": "test", "request": "요청", "draft": "초안", "facts": [{"id": "f1", "content": "근거"}],
                   "requiredFactIds": [], "requestedStyle": "", "styleExamples": "", "criteria": ["FACTUAL_SUPPORT", "PROMOTIONAL_CLAIMS"]}
        self.assertEqual(validate(partial), partial)
        for criteria in ([], ["unknown"], ["FACTUAL_SUPPORT", "FACTUAL_SUPPORT"], ["REQUIRED_FACTS"], ["REQUESTED_STYLE"], ["STYLE_LEAKAGE"]):
            with self.assertRaises(ValueError):
                validate({**partial, "criteria": criteria})
        with self.assertRaises(ValueError):
            validate({k: v for k, v in partial.items() if k != "criteria"})


if __name__ == "__main__":
    unittest.main()
