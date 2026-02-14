"""Shared Modal infrastructure for vLLM model serving and training."""

import modal

MINUTES = 60

hf_cache_vol = modal.Volume.from_name("re-zero-hf-cache", create_if_missing=True)
vllm_cache_vol = modal.Volume.from_name("re-zero-vllm-cache", create_if_missing=True)
checkpoints_vol = modal.Volume.from_name("re-zero-checkpoints", create_if_missing=True)

CACHE_VOLUMES = {
    "/root/.cache/huggingface": hf_cache_vol,
    "/root/.cache/vllm": vllm_cache_vol,
}

# Training writes checkpoints here; serve scripts read from here
CHECKPOINTS_PATH = "/root/checkpoints"
CHECKPOINTS_VOLUME = {CHECKPOINTS_PATH: checkpoints_vol}


def create_vllm_image(extra_packages: list[str] | None = None) -> modal.Image:
    packages = ["vllm", "huggingface-hub"]
    if extra_packages:
        packages.extend(extra_packages)
    return (
        modal.Image.from_registry(
            "nvidia/cuda:12.8.0-devel-ubuntu22.04", add_python="3.12"
        )
        .entrypoint([])
        .pip_install(*packages)
        .env({"HF_XET_HIGH_PERFORMANCE": "1"})
    )
