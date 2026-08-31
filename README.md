# AI Detector

An AI-vs-real image detector that combines an ONNX image model with frequency-domain evidence. The UI makes disagreement explicit instead of forcing every input into a binary label.

## Backend setup

```sh
cd backend
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

Place a trained checkpoint at `backend/models/detector_v1.onnx` before requesting detections. The API fails clearly with HTTP 503 when that model is missing; it never fabricates a prediction.

## Frontend setup

```sh
cd frontend
npm install
npm run dev
```

The frontend defaults to `http://localhost:8000`. Set `NEXT_PUBLIC_API_URL` when the backend runs elsewhere.

## Export an ONNX model

With a compatible timm ResNet-18 checkpoint:

```sh
cd backend
python scripts/export_onnx.py path/to/checkpoint.pth --output models/detector_v1.onnx
```

The script verifies the exported graph with a dummy inference and checks that its output shape is `(1, 2)`.

## API

`POST /api/v1/detect/image` accepts a multipart field named `upload`. Supported formats are JPEG, PNG, and WebP. `GET /health` provides a lightweight service check.

## Accuracy & Limitations

Detection is probabilistic, not a guarantee of provenance or authenticity. Results can be adversarially degraded, especially by transformations or content unlike the training distribution. The system reports a binary AI or real verdict, and is not a marketing claim of perfect accuracy.