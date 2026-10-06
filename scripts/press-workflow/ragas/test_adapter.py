import unittest
from evaluate import validate


class AdapterContract(unittest.TestCase):
    def test_exact_protocol_and_bounds(self):
        value = {"user_input": "질문", "response": "답변", "retrieved_contexts": ["근거"], "model": "test"}
        self.assertEqual(validate(value), value)
        for invalid in ({**value, "secret": "no"}, {**value, "retrieved_contexts": []}, {**value, "response": "x" * 20001}):
            with self.assertRaises(ValueError):
                validate(invalid)


if __name__ == "__main__":
    unittest.main()
