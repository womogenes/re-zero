"""Run GLM-4.7-Flash training on Modal GPUs.

GLM-4.7-Flash (zai-org/GLM-4.7-Flash) is a 30B MoE (3B active) text-only
transformer with MLA (Multi-head Latent Attention). No mamba-ssm needed.
Requires transformers from main branch for Glm4MoeLiteForCausalLM support.
Uses 4x H100: GPU 0 = inference (vLLM), GPUs 1-3 = trainer (FSDP + LoRA).
"""

import modal

MINUTES = 60
PRIME_RL_DIR = "/opt/prime-rl"
PRIME_RL_VENV = f"{PRIME_RL_DIR}/.venv"

hf_cache_vol = modal.Volume.from_name("re-zero-hf-cache", create_if_missing=True)
vllm_cache_vol = modal.Volume.from_name("re-zero-vllm-cache", create_if_missing=True)
checkpoints_vol = modal.Volume.from_name("re-zero-checkpoints", create_if_missing=True)
mlflow_vol = modal.Volume.from_name("re-zero-mlflow", create_if_missing=True)

VOLUMES = {
    "/root/.cache/huggingface": hf_cache_vol,
    "/root/.cache/vllm": vllm_cache_vol,
    "/root/checkpoints": checkpoints_vol,
    "/root/mlflow": mlflow_vol,
}


def _install_glm4flash_patches():
    """Apply patches for GLM-4.7-Flash compatibility with prime-rl."""
    import re

    # 1. Fix get_max_tokens() API for vLLM compatibility
    serving_file = f"{PRIME_RL_DIR}/src/prime_rl/inference/vllm/serving_chat_with_tokens.py"
    with open(serving_file) as f:
        content = f.read()
    if "get_max_tokens" in content:
        content = content.replace(
            "model_config.get_max_tokens()",
            "getattr(model_config, 'max_model_len', None) or model_config.max_seq_len_to_capture",
        )
        with open(serving_file, "w") as f:
            f.write(content)
        print("Patched serving_chat_with_tokens.py: fixed get_max_tokens() call")

    # 2. Add gradient diagnostics to training loop
    train_file = f"{PRIME_RL_DIR}/src/prime_rl/trainer/rl/train.py"
    with open(train_file) as f:
        train_content = f.read()

    # Find the backward pass and add diagnostics after loss computation
    old_backward = "loss.backward()"
    new_backward = """loss.backward()
            # [DIAG] Gradient diagnostics
            import sys
            total_grad = sum(p.grad.abs().sum().item() for p in model.parameters() if p.grad is not None)
            n_grad = sum(1 for p in model.parameters() if p.grad is not None and p.grad.abs().sum() > 0)
            n_total = sum(1 for p in model.parameters() if p.grad is not None)
            print(f"[DIAG] loss={loss.item():.6f}, total_abs_grad={total_grad:.6f}, params_with_grad={n_grad}/{n_total}", file=sys.stderr, flush=True)"""

    if old_backward in train_content:
        train_content = train_content.replace(old_backward, new_backward, 1)
        with open(train_file, "w") as f:
            f.write(train_content)
        print("Patched train.py: added gradient diagnostics")

    # 3. Add detailed diagnostics to loss function
    loss_file = f"{PRIME_RL_DIR}/src/prime_rl/trainer/rl/loss.py"
    with open(loss_file) as f:
        loss_content = f.read()

    # Add diagnostics before the final loss computation
    old_loss_return = "loss = -(coeff.detach() * trainer_logprobs)[keep_mask].sum()"
    if old_loss_return in loss_content:
        new_loss_return = """# [DIAG] Loss diagnostics
    import sys
    _trainer_lp = trainer_logprobs[keep_mask]
    _inf_lp = inference_logprobs[keep_mask]
    _coeff_vals = coeff.detach()[keep_mask]
    _adv_vals = advantages[keep_mask] if advantages.dim() > 0 else advantages
    print(f"[DIAG-LOSS] keep_mask True: {keep_mask.sum().item()}/{keep_mask.numel()}", file=sys.stderr, flush=True)
    print(f"[DIAG-LOSS] trainer_logprobs[mask]: min={_trainer_lp.min().item():.4f}, max={_trainer_lp.max().item():.4f}, mean={_trainer_lp.mean().item():.4f}, has_nan={_trainer_lp.isnan().any().item()}", file=sys.stderr, flush=True)
    print(f"[DIAG-LOSS] inference_logprobs[mask]: min={_inf_lp.min().item():.4f}, max={_inf_lp.max().item():.4f}, mean={_inf_lp.mean().item():.4f}, has_nan={_inf_lp.isnan().any().item()}", file=sys.stderr, flush=True)
    print(f"[DIAG-LOSS] coeff[mask]: min={_coeff_vals.min().item():.6f}, max={_coeff_vals.max().item():.6f}, mean={_coeff_vals.mean().item():.6f}, has_nan={_coeff_vals.isnan().any().item()}", file=sys.stderr, flush=True)
    print(f"[DIAG-LOSS] importance_ratio: min={importance_ratio.min().item():.6f}, max={importance_ratio.max().item():.6f}, mean={importance_ratio.mean().item():.6f}", file=sys.stderr, flush=True)
    loss = -(coeff.detach() * trainer_logprobs)[keep_mask].sum()"""
        loss_content = loss_content.replace(old_loss_return, new_loss_return, 1)
        with open(loss_file, "w") as f:
            f.write(loss_content)
        print("Patched loss.py: added loss diagnostics")
    else:
        print(f"WARNING: Could not find loss computation line in {loss_file}")

    # Verify get_max_tokens patch
    with open(serving_file) as f:
        if "get_max_tokens" not in f.read():
            print("OK: get_max_tokens patch verified.")
        else:
            print("WARNING: get_max_tokens patch may not have applied.")

    print("GLM-4.7-Flash patches installed successfully (v1).")


glm4flash_image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.8.0-devel-ubuntu22.04", add_python="3.12"
    )
    .entrypoint([])
    .apt_install("git", "g++", "ninja-build")
    .pip_install("uv")
    .run_commands(
        f"git clone https://github.com/PrimeIntellect-ai/prime-rl.git {PRIME_RL_DIR}",
        f"cd {PRIME_RL_DIR} && uv sync --no-dev --extra flash-attn",
        # GLM-4.7-Flash (glm4_moe_lite) requires latest transformers
        f"VIRTUAL_ENV={PRIME_RL_VENV} uv pip install git+https://github.com/huggingface/transformers.git",
        f"VIRTUAL_ENV={PRIME_RL_VENV} uv pip install mlflow 'huggingface-hub[hf_xet]'",
    )
    .run_function(_install_glm4flash_patches)
    .run_commands("echo 'glm4flash-patch-v1: diagnostics + get_max_tokens fix'")
    .env({
        "HF_XET_HIGH_PERFORMANCE": "1",
        "PYTHONUNBUFFERED": "1",
    })
    .add_local_dir("configs", remote_path="/root/configs")
)

app = modal.App("re-zero-glm4flash")


@app.function(
    image=glm4flash_image,
    gpu="H100:4",
    timeout=120 * MINUTES,
    volumes=VOLUMES,
    secrets=[modal.Secret.from_name("huggingface")],
)
def train(config_path: str, resume: bool = False):
    """Train GLM-4.7-Flash."""
    import os
    import subprocess

    full_path = f"/root/configs/{config_path}"
    print(f"Starting GLM-4.7-Flash training with config: {full_path}")
    if resume:
        print("Resume mode: will resume from latest checkpoint")

    venv_bin = f"{PRIME_RL_VENV}/bin"
    env = {
        **os.environ,
        "VIRTUAL_ENV": PRIME_RL_VENV,
        "PATH": f"{venv_bin}:{os.environ.get('PATH', '/usr/local/bin:/usr/bin:/bin')}",
        "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True",
        "MLFLOW_TRACKING_URI": "file:///root/mlflow",
    }

    cmd = [f"{venv_bin}/rl", "@", full_path]
    if resume:
        cmd.extend(["--ckpt.resume-step", "-1"])

    result = subprocess.run(cmd, cwd="/root", check=True, env=env)
    return result.returncode


@app.local_entrypoint()
def main(config: str = "glm4flash-redteam.toml", resume: bool = False):
    """Launch GLM-4.7-Flash training.

    Examples:
        modal run deploy/train_glm4flash.py --config glm4flash-redteam.toml
        modal run deploy/train_glm4flash.py --config glm4flash-codevuln.toml --resume
    """
    print(f"[GLM-4.7-Flash] Launching: {config}")
    train.remote(config, resume)
