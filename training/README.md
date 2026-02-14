# Re:Zero — Training

RL training of security models on CTF environments via Prime Intellect, deployed via vLLM on Modal.

## Quick start

```bash
uv sync
uv tool install prime
prime login
modal setup
```

## Prime RL environments

- [sv-env-redteam-attack](https://app.primeintellect.ai/dashboard/environments/intertwine/sv-env-redteam-attack)
- [sv-env-code-vulnerability](https://app.primeintellect.ai/dashboard/environments/intertwine/sv-env-code-vulnerability)
- [sv-env-config-verification](https://app.primeintellect.ai/dashboard/environments/intertwine/sv-env-config-verification)
- [sv-env-network-logs](https://app.primeintellect.ai/dashboard/environments/intertwine/sv-env-network-logs)
- [sv-env-phishing-detection](https://app.primeintellect.ai/dashboard/environments/intertwine/sv-env-phishing-detection)

## Models

| Model | HuggingFace ID | Deploy |
|-------|---------------|--------|
| GLM-4.7V | `THUDM/GLM-4.7V` | `modal deploy deploy/serve_glm47v.py` |
| Nemotron 3 Nano | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16` | `modal deploy deploy/serve_nemotron.py` |

## Training (on Modal)

```bash
# Create secrets (once)
modal secret create re-zero-keys MLFLOW_TRACKING_URI=<your-uri>

# Launch training
modal run deploy/train.py --config nemotron-redteam.toml
```

## Serving (on Modal)

```bash
# Deploy model endpoint
modal deploy deploy/serve_nemotron.py

# Dev mode (auto-reload)
modal serve deploy/serve_nemotron.py
```

## Workflow

1. **Setup** — `uv sync`, `uv tool install prime`, `prime login`, `modal setup`
2. **Install CTF environments** — `prime env install intertwine/sv-env-redteam-attack` (repeat for all 5)
3. **Write training configs** — create TOML configs in `configs/` for each model x environment combo (see prime-rl docs for format)
4. **Train on Modal** — `modal run deploy/train.py --config <config>.toml` to run RL training on Modal H100s
5. **Iterate** — watch reward curves in mlflow, adjust configs, try different environments
6. **Serve trained models** — update deploy scripts to point at trained checkpoints, `modal deploy deploy/serve_<model>.py` to serve as OpenAI-compatible endpoints
