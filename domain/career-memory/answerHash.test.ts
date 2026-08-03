import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalizeCareerAnswer,
  hashCareerAnswer,
  hashCareerRetrievalQuery,
} from "./answerHash";

test("answer hashing normalizes line endings and trailing whitespace only", () => {
  assert.equal(
    canonicalizeCareerAnswer("  first  \r\nsecond \r\n\r\n"),
    "  first\nsecond",
  );
  assert.equal(hashCareerAnswer("answer\r\n"), hashCareerAnswer("answer\n"));
  assert.notEqual(hashCareerAnswer("Answer"), hashCareerAnswer("answer"));
  assert.equal(
    hashCareerRetrievalQuery([" question ", "", "job"]),
    hashCareerRetrievalQuery(["question", "job"]),
  );
});
