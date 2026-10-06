# Qwen3 notes

Qwen3 is Alibaba's open-weight model family (dense and MoE variants, up to
235B parameters total with 22B active). The instruct models are strong at
multilingual chat and tool use; the thinking variants (`Qwen3-30B-A3B-Thinking`)
expose chain-of-thought for math and coding.

## Serving

For local experiments I run the 4B and 8B instruct models through
Hugging Face's inference endpoints — no vendor lock-in, plain OpenAI-style
HTTP. Context window is 256k tokens on the recent checkpoints, which
comfortably fits a whole vault's worth of retrieved chunks plus the question.

## Practical notes

- Temperature 0.7 is a good default for chat; drop to 0.2–0.3 for
  extraction-style tasks like summarization.
- The models are sensitive to the system prompt: state citation rules
  explicitly (e.g. "cite sources as [[Note Name]]") or they get creative.
- For embeddings I pair it with a small dedicated embedding model rather
  than the chat model — cheaper and better at retrieval.
