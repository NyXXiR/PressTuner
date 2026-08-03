import assert from "node:assert/strict";
import test from "node:test";

import { hashArticleContent } from "./articleContentHash";

const article = {
  title: "Launch",
  bodyJson: {
    lead: "Lead",
    fact: "Fact",
    paragraphs: [{ text: "First" }, { text: "Second" }],
    closing: "Closing",
  },
};

test("canonical article hash is stable across object key ordering", () => {
  assert.equal(
    hashArticleContent(article),
    hashArticleContent({
      bodyJson: {
        closing: "Closing",
        paragraphs: [{ text: "First" }, { text: "Second" }],
        fact: "Fact",
        lead: "Lead",
      },
      title: "Launch",
    }),
  );
});

test("canonical article hash changes for every persisted draft component", () => {
  const baseline = hashArticleContent(article);
  const variants = [
    { ...article, title: "Changed" },
    { ...article, bodyJson: { ...article.bodyJson, lead: "Changed" } },
    { ...article, bodyJson: { ...article.bodyJson, fact: "Changed" } },
    {
      ...article,
      bodyJson: {
        ...article.bodyJson,
        paragraphs: [...article.bodyJson.paragraphs].reverse(),
      },
    },
    {
      ...article,
      bodyJson: {
        ...article.bodyJson,
        paragraphs: [{ text: "Changed" }, { text: "Second" }],
      },
    },
    { ...article, bodyJson: { ...article.bodyJson, closing: "Changed" } },
  ];
  for (const variant of variants) {
    assert.notEqual(hashArticleContent(variant), baseline);
  }
});
