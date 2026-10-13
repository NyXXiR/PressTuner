import type { NextConfig } from "next";

const qualityTraceFiles = [
      "./scripts/press-workflow/ragas/evaluate.py",
      "./scripts/press-workflow/deepeval/faithfulness.py",
      "./scripts/press-workflow/deepeval/evaluate.py",
      "./scripts/press-workflow/deepeval/rubric.json",
      "./scripts/press-workflow/deepeval-port.ts",
      "./scripts/press-workflow/deepeval/requirements-lock.txt",
      "./scripts/press-workflow/ragas/requirements-lock.txt",
      "./domain/press-workflow/evaluation/standard-profile.json",
      "./domain/press-workflow/evaluation/article-evaluation.ts",
      "./lib/services/press-workflow/evaluation/articleEvaluation.ts",
      "./lib/services/press-workflow/evaluation/qualityRuntime.server.ts",
      "./lib/services/press-workflow/evaluation/standard.ts",
      "./lib/services/press-workflow/evaluation/standardRuntime.server.ts",
    ];
const qualityTraceExcludes = [
      "./evals/**/*",
      "./.agent-work/**/*",
      "./.venv*/**/*",
      "./scripts/press-workflow/**/test_*.py",
      "./**/__pycache__/**/*",
      "./**/*.test.*",
      "./docs/**/*",
      "./tests/**/*",
      "./*.md",
      "./*.tsbuildinfo",
      "./temp_lines.txt",
    ];

const nextConfig: NextConfig = {
  /* config options here */
  async redirects() {
    return [
      {
        source: "/my/dashboard",
        destination: "/press/dashboard",
        permanent: true,
      },
      {
        source: "/my/articles/pending",
        destination: "/press/articles",
        permanent: true,
      },
      {
        source: "/my/articles",
        destination: "/press/articles",
        permanent: true,
      },
      {
        source: "/articles/new",
        destination: "/press/new",
        permanent: true,
      },
      {
        source: "/articles/:id/edit",
        destination: "/press/:id/edit",
        permanent: true,
      },
      {
        source: "/articles/:id",
        destination: "/press/articles/:id",
        permanent: true,
      },
    ];
  },
  distDir: process.env.NEXT_DIST_DIR?.trim() || undefined,
  productionBrowserSourceMaps: true,
  outputFileTracingIncludes: {
    "/api/articles/*/quality-evaluation": qualityTraceFiles,
    "/api/press/quality-studies{,/**}": [...qualityTraceFiles,
      "./lib/services/press-workflow/evaluation/studyRuntime.server.ts",
      "./lib/services/press-workflow/runDraftWorkflow.ts",
      "./domain/press-workflow/configuration.ts",
      "./lib/llm/articleGenerator.ts",
      "./lib/llm/prompts/press-release.ts",
      "./lib/utils/datetime.ts",
    ],
  },
  outputFileTracingExcludes: {
    "/api/articles/*/quality-evaluation": qualityTraceExcludes,
    "/api/press/quality-studies{,/**}": qualityTraceExcludes,
  },
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
    ],
  },
  async headers() {
    return [{
      source: "/fonts/resume/:path*",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    }];
  },
};

export default nextConfig;
