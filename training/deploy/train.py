"""Run prime-rl training jobs on Modal GPUs."""

import modal

from .common import CACHE_VOLUMES, CHECKPOINTS_PATH, CHECKPOINTS_VOLUME, MINUTES, create_vllm_image

# prime-rl needs vllm for inference, plus its own deps
train_image = create_vllm_image(extra_packages=["prime-rl", "verifiers", "mlflow"])

app = modal.App("re-zero-training")

CONFIGS_DIR = modal.Mount.from_local_dir(
    "configs", remote_path="/root/configs"
)


@app.function(
    image=train_image,
    gpu="H100:2",
    timeout=120 * MINUTES,
    volumes={**CACHE_VOLUMES, **CHECKPOINTS_VOLUME},
    mounts=[CONFIGS_DIR],
    secrets=[modal.Secret.from_name("re-zero-keys", required_keys=["MLFLOW_TRACKING_URI"])],
)
def train(config_path: str):
    """Launch a prime-rl training run.

    Args:
        config_path: Path to TOML config relative to configs/, e.g. "nemotron-redteam.toml"
    """
    import subprocess

    full_path = f"/root/configs/{config_path}"
    print(f"Starting training with config: {full_path}")

    # prime-rl entrypoint: runs trainer + orchestrator + inference as async processes
    result = subprocess.run(
        ["uv", "run", "rl", "@", full_path],
        check=True,
    )
    return result.returncode


@app.local_entrypoint()
def main(config: str = "nemotron-redteam.toml"):
    """Launch training from CLI: modal run deploy/train.py --config nemotron-redteam.toml"""
    train.remote(config)
