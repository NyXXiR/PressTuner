// lib/llm/embedding.ts
import OpenAI from "openai";
import { AI_MODELS } from "../constants/ai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const EMBEDDING_DIMENSIONS = 1536;

export function assertEmbeddingDimensions(
  embedding: readonly number[],
  expectedDimensions = EMBEDDING_DIMENSIONS,
): void {
  if (embedding.length !== expectedDimensions) {
    throw new Error("EMBEDDING_DIMENSION_MISMATCH");
  }
}

/**
 * 텍스트의 벡터 임베딩을 가져옵니다.
 * 모델: text-embedding-3-small (비용 효율적이고 성능 우수)
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const cleanText = text.replace(/\n/g, " ").trim();
  
  if (!cleanText) return [];

  const response = await openai.embeddings.create({
    model: AI_MODELS.EMBEDDING,
    input: cleanText,
    encoding_format: "float",
  });

  const embedding = response.data[0]?.embedding;
  if (!embedding) throw new Error("EMBEDDING_RESPONSE_EMPTY");
  assertEmbeddingDimensions(embedding);
  return embedding;
}

export async function getEmbeddings(texts: readonly string[]): Promise<number[][]> {
  const normalized = texts.map((text) => text.replace(/\n/g, " ").trim());
  if (normalized.length === 0) return [];
  if (normalized.some((text) => !text)) {
    throw new Error("EMBEDDING_INPUT_EMPTY");
  }

  const response = await openai.embeddings.create({
    model: AI_MODELS.EMBEDDING,
    input: normalized,
    encoding_format: "float",
  });

  const embeddings = [...response.data]
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
  if (embeddings.length !== normalized.length) {
    throw new Error("EMBEDDING_COUNT_MISMATCH");
  }
  embeddings.forEach((embedding) => assertEmbeddingDimensions(embedding));
  return embeddings;
}

/**
 * 코사인 유사도 계산
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let mA = 0;
  let mB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    mA += vecA[i] * vecA[i];
    mB += vecB[i] * vecB[i];
  }
  
  mA = Math.sqrt(mA);
  mB = Math.sqrt(mB);
  
  if (mA === 0 || mB === 0) return 0;
  
  return dotProduct / (mA * mB);
}
