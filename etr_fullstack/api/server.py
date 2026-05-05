import os
from pathlib import Path
from typing import Any
import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO

app = FastAPI(title="Triveni '26 Endurance Terminal")

# --- PATHS ---
APP_ROOT = Path(__file__).resolve().parent
# We save our custom weights here
MODEL_PATH = APP_ROOT / "triveni_dice_model.pt"
DATASET_PATH = "C:/Users/anami/OneDrive/Desktop/my project/ETR/etr_fullstack/api/dataset"

# --- TEAM CODES ---
# These match the folder names in your dataset
TEAM_CONFIG = {
    "RED": "ALPHA-7",
    "BLUE": "SIGMA-3",
    "YELLOW": "DELTA-9"
}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize with base classification model (wiping old object detection data)
# This will be overwritten after you run the /train route
MODEL = YOLO(str(MODEL_PATH)) if MODEL_PATH.exists() else YOLO("yolov8n-cls.pt")

@app.get("/train")
async def train_model():
    """Wipes old data and trains only on RED, BLUE, and YELLOW folders"""
    try:
        print("[SYSTEM] Erasing demo data... Initializing Clean Training.")
        # Training strictly on your 3 folders
        MODEL.train(
            data=DATASET_PATH, 
            epochs=25, 
            imgsz=224, 
            device="cpu" # Uses your Asus TUF NVIDIA GPU
        )
        # Export the trained model to our permanent path
        MODEL.export(format="pt")
        return {"status": "success", "message": "Model trained on Teams: Red, Blue, Yellow."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/predict")
async def predict(file: UploadFile = File(...)) -> dict[str, Any]:
    payload = await file.read()
    np_buffer = np.frombuffer(payload, dtype=np.uint8)
    image = cv2.imdecode(np_buffer, cv2.IMREAD_COLOR)

    if image is None:
        raise HTTPException(status_code=400, detail="Invalid scan input.")

    # Run the classification
    results = MODEL(image, verbose=False)[0]
    
    # Get top predicted team
    top_class_idx = results.probs.top1
    class_name = results.names[top_class_idx].upper() 
    confidence = float(results.probs.top1conf)

    if confidence > 0.50 and class_name in TEAM_CONFIG:
        access_code = TEAM_CONFIG[class_name]
        terminal_msg = f"[TARS]: Target {class_name} Verified. Code: {access_code}"
    else:
        access_code = "DENIED"
        terminal_msg = f"[TARS]: Visual confirmation failed. Match: {class_name} ({confidence*100:.0f}%)"

    return {
        "success": True,
        "team": class_name,
        "access_code": access_code,
        "terminal": terminal_msg,
        "result": access_code  # <-- ADD THIS EXACT LINE
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)