# Press AI debugger deterministic evaluation

Run `npm run eval:press-ai-debugger:ci`. The default evaluator reads the versioned `v2` dataset and baseline, including the registered rewrite→review iteration edge, invokes the production transition guardrails directly, and writes one JSON artifact to stdout. Use `--output <path>` to write the same JSON for CI upload. The `v1` fixtures remain unchanged as historical v2-process evidence.

The default mode is deterministic and has no model, provider, billing, or quota dependency. `--mode live` is refused without `--allow-spend`; a live executor is intentionally not implemented in this slice.

Dataset identity includes its content hash, process version, registry hash, and unique case IDs. Any topology mismatch, malformed fixture, failed release gate, or live-mode request produces valid JSON and a non-zero exit status.
