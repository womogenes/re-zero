"""Modal deployment for GLM-4.7-Flash via vLLM.

Serves either the base HF model or an RL-trained checkpoint from the checkpoints volume.
Set CHECKPOINT to a path like "glm4flash-redteam/step-50" to serve a trained model.

30B MoE (3B active) — fits on 1 H100 but uses 2 for better KV cache / throughput.
"""

import os
import subprocess

import modal

from .common import (
    CACHE_VOLUMES,
    CHECKPOINTS_PATH,
    CHECKPOINTS_VOLUME,
    MINUTES,
    create_vllm_image,
)

# Set to None for base HF model, or a subfolder name for a trained checkpoint
# e.g. "glm4flash-redteam/step-50"
CHECKPOINT = None

BASE_MODEL = "zai-org/GLM-4.7-Flash"
SERVED_NAME = "glm-4.7-flash"
N_GPU = 2
VLLM_PORT = 8000

vllm_image = create_vllm_image()
app = modal.App("re-zero-glm4flash")


@app.function(
    image=vllm_image,
    gpu=f"H100:{N_GPU}",
    scaledown_window=15 * MINUTES,
    timeout=10 * MINUTES,
    volumes={**CACHE_VOLUMES, **CHECKPOINTS_VOLUME},
    secrets=[modal.Secret.from_name("huggingface")],
)
@modal.concurrent(max_inputs=32)
@modal.web_server(port=VLLM_PORT, startup_timeout=10 * MINUTES)
def serve():
    model_path = (
        os.path.join(CHECKPOINTS_PATH, CHECKPOINT) if CHECKPOINT else BASE_MODEL
    )
    cmd = [
        "vllm",
        "serve",
        model_path,
        "--served-model-name",
        SERVED_NAME,
        "--host",
        "0.0.0.0",
        "--port",
        str(VLLM_PORT),
        "--tensor-parallel-size",
        str(N_GPU),
        "--trust-remote-code",
        "--enable-auto-tool-choice",
        "--tool-call-parser",
        "hermes",
        "--max-model-len",
        "32768",
        "--enforce-eager",
        "--gpu-memory-utilization",
        "0.95",
    ]
    subprocess.Popen(cmd)
