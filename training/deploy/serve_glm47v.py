"""Modal deployment for GLM-4.7V via vLLM.

Serves either the base HF model or an RL-trained checkpoint from the checkpoints volume.
Set CHECKPOINT to a path like "glm47v-code-vulnerability/step-200" to serve a trained model.
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
# e.g. "glm47v-code-vulnerability/step-200"
CHECKPOINT = None

BASE_MODEL = "THUDM/GLM-4.7V"
SERVED_NAME = "glm-4.7v"
N_GPU = 4
VLLM_PORT = 8000

vllm_image = create_vllm_image()
app = modal.App("re-zero-glm47v")


@app.function(
    image=vllm_image,
    gpu=f"H100:{N_GPU}",
    scaledown_window=15 * MINUTES,
    timeout=10 * MINUTES,
    volumes={**CACHE_VOLUMES, **CHECKPOINTS_VOLUME},
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
        "glm47",
        "--max-model-len",
        "32768",
        "--enforce-eager",
    ]
    subprocess.Popen(cmd)
