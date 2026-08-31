import argparse
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
import timm


def export(checkpoint: Path, output: Path, num_classes: int) -> None:
    if not checkpoint.is_file():
        raise FileNotFoundError(f"Checkpoint not found: {checkpoint}")
    model = timm.create_model("resnet18", pretrained=False, num_classes=num_classes)
    state = torch.load(checkpoint, map_location="cpu")
    model.load_state_dict(state.get("state_dict", state))
    model.eval()
    output.parent.mkdir(parents=True, exist_ok=True)
    dummy = torch.randn(1, 3, 384, 384)
    torch.onnx.export(
        model,
        dummy,
        output,
        input_names=["images"],
        output_names=["scores"],
        dynamic_axes={"images": {0: "batch"}, "scores": {0: "batch"}},
        opset_version=17,
    )
    session = ort.InferenceSession(str(output), providers=["CPUExecutionProvider"])
    result = session.run(None, {session.get_inputs()[0].name: dummy.numpy()})
    expected = (1, num_classes)
    if tuple(np.asarray(result[0]).shape) != expected:
        raise RuntimeError(f"Export verification failed: expected {expected}, got {np.asarray(result[0]).shape}")
    print(f"Exported and verified {output} with output shape {expected}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export the detector backbone to ONNX")
    parser.add_argument("checkpoint", type=Path)
    parser.add_argument("--output", type=Path, default=Path("models/detector_v1.onnx"))
    parser.add_argument("--num-classes", type=int, default=2)
    args = parser.parse_args()
    export(args.checkpoint, args.output, args.num_classes)