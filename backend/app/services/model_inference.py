from pathlib import Path
from threading import Lock
from typing import Final

import cv2
import numpy as np
import onnxruntime as ort


class ONNXDetector:
    """Run a binary ONNX detector with serialized inference access.

    The lock protects providers and session execution because some ONNX execution
    providers reuse mutable buffers; preprocessing always returns NCHW float32 data.
    """

    INPUT_SIZE: Final[int] = 384

    def __init__(self, model_path: str) -> None:
        path = Path(model_path)
        if not path.is_file():
            raise FileNotFoundError(
                f"Detector checkpoint not found at {path}. Export or provide models/detector_v1.onnx."
            )
        self._session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
        inputs = self._session.get_inputs()
        if not inputs:
            raise ValueError(f"ONNX detector at {path} has no inputs")
        self._input_name = inputs[0].name
        self._lock = Lock()

    @staticmethod
    def preprocess(image: np.ndarray) -> np.ndarray:
        if not isinstance(image, np.ndarray) or image.size == 0 or image.ndim != 3 or image.shape[2] != 3:
            raise ValueError("ONNX preprocessing expects a non-empty BGR image")
        resized = cv2.resize(image, (ONNXDetector.INPUT_SIZE, ONNXDetector.INPUT_SIZE), interpolation=cv2.INTER_AREA)
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        normalized = (rgb - np.array([0.485, 0.456, 0.406], dtype=np.float32)) / np.array(
            [0.229, 0.224, 0.225], dtype=np.float32
        )
        return np.transpose(normalized, (2, 0, 1))[None, ...].astype(np.float32)

    def predict(self, image: np.ndarray) -> float:
        tensor = self.preprocess(image)
        with self._lock:
            outputs = self._session.run(None, {self._input_name: tensor})
        if not outputs or np.asarray(outputs[0]).size == 0:
            raise ValueError("ONNX detector returned no score")
        values = np.asarray(outputs[0], dtype=np.float32).reshape(-1)
        if values.size == 1:
            score = float(values[0])
        elif values.size == 2:
            probabilities = np.exp(values - np.max(values))
            score = float((probabilities / probabilities.sum())[1])
        else:
            raise ValueError(f"Expected one or two ONNX outputs, received {values.size}")
        if not 0.0 <= score <= 1.0:
            score = float(1.0 / (1.0 + np.exp(-score)))
        return score