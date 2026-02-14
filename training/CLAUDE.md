# Training Module — Re:Zero

## What this is
RL training pipeline for security-focused models using Prime Intellect's libraries (prime-rl, verifiers, environments hub), running on Modal GPUs ($5k credits). Trained models also get served via vLLM on Modal.

## Package management
- **uv only**. Never use pip. Never manually edit pyproject.toml for package versions.
- Add packages: `uv add <package>`
- Remove packages: `uv remove <package>`
- Sync environment: `uv sync`
- Install CLI tools: `uv tool install <tool>` (e.g. `uv tool install prime`)

## Prime Intellect stack

### CLI (`prime`)
```bash
uv tool install prime        # install
prime login                  # authenticate (required once)
prime env list               # browse environments hub
prime env install owner/name # install an environment
```
We do NOT use `prime rl run` (that's PI's hosted infra). We run training on Modal instead.

### prime-rl
Async RL training framework. Three components: trainer, orchestrator, inference (vLLM). Configs are TOML.
- Repo: github.com/PrimeIntellect-ai/prime-rl
- Docs: docs.primeintellect.ai/prime-rl/

### verifiers
Library for RL environments and reward functions. Environments are Python packages with datasets, harnesses, and rubrics.
- `uv add verifiers` (already installed)
- Repo: github.com/PrimeIntellect-ai/verifiers

## Models
| Model | HuggingFace ID | Notes |
|-------|---------------|-------|
| GLM-4.7V | `THUDM/GLM-4.7V` | Vision model, needs 4x H100 for serving |
| Nemotron 3 Nano | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16` | MoE, 30B total / 3.5B active. FP8 variant for deployment: `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-FP8` |

## CTF environments (from intertwine on Prime Intellect Environments Hub)
1. `intertwine/sv-env-redteam-attack` — red team attack simulation
2. `intertwine/sv-env-code-vulnerability` — vulnerability detection & repair
3. `intertwine/sv-env-config-verification` — security config auditing
4. `intertwine/sv-env-network-logs` — network anomaly detection
5. `intertwine/sv-env-phishing-detection` — phishing classification

## Modal (training + serving)
All compute runs on Modal. We have $5k in credits.

### Training
- `modal run deploy/train.py --config nemotron-redteam.toml` — launch RL training
- Configs are mounted from `configs/` into the container
- Training uses prime-rl inside the Modal container (trainer + orchestrator + vLLM inference, all async)
- Checkpoints are saved to the `re-zero-checkpoints` Modal Volume at `/root/checkpoints/`
- Secrets: create once with `modal secret create re-zero-keys MLFLOW_TRACKING_URI=<key>`
- GPU default: 2x H100 (adjust in deploy/train.py as needed)

### Serving
- `modal deploy deploy/serve_nemotron.py` — deploy Nemotron
- `modal deploy deploy/serve_glm47v.py` — deploy GLM-4.7V
- `modal serve deploy/serve_<model>.py` — dev mode with auto-reload
- Models served as OpenAI-compatible endpoints via vLLM
- By default serves the base HF model. To serve a trained checkpoint, set `CHECKPOINT` in the serve script to the subfolder name (e.g. `"nemotron-nano-redteam-attack/step-200"`)
- Three Modal Volumes: `re-zero-hf-cache` (HF downloads), `re-zero-vllm-cache` (vLLM cache), `re-zero-checkpoints` (trained weights)

### General
- Run `modal setup` once to authenticate.
- Never commit Modal tokens or secrets. Use `modal secret create` for API keys.

## File layout
```
training/
├── configs/          # prime-rl training TOML configs
├── deploy/           # Modal scripts (training + serving)
│   ├── common.py     # shared image, volumes
│   ├── train.py      # RL training on Modal GPUs
│   ├── serve_nemotron.py
│   └── serve_glm47v.py
├── CLAUDE.md
├── README.md
└── pyproject.toml
```

## Workflow
1. **Setup** — `uv sync`, `uv tool install prime`, `prime login`, `modal setup`
2. **Install CTF environments** — `prime env install intertwine/sv-env-redteam-attack` (repeat for all 5)
3. **Write training configs** — create TOML configs in `configs/` for each model x environment combo (see prime-rl docs for format)
4. **Train on Modal** — `modal run deploy/train.py --config <config>.toml` to run RL training on Modal H100s
5. **Iterate** — watch reward curves in mlflow, adjust configs, try different environments
6. **Serve trained models** — update deploy scripts to point at trained checkpoints, `modal deploy deploy/serve_<model>.py` to serve as OpenAI-compatible endpoints

## Rules
- Never use pip
- Never manually edit pyproject.toml dependency versions
- Never commit .env, .modal/, model weights, or mlflow/ directories
- Never hardcode API keys or tokens
- Keep configs in configs/ as TOML files
- Keep deployment scripts in deploy/
