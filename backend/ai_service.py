import os
import cv2
import torch
import numpy as np
import shutil
import uuid
import requests
import time
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from ultralytics import YOLO
from dotenv import load_dotenv
# Note: gemini_fire_verifier is no longer used here - Gemini verification is handled by Next.js

# Load environment variables from .env file
load_dotenv()

# ------------------------------
# Setup
# ------------------------------
# Create a temporary directory to store uploaded videos
TEMP_DIR = "temp_videos"
os.makedirs(TEMP_DIR, exist_ok=True)

# Create a directory to store detection snapshots
SNAPSHOT_DIR = "saved_snapshots"
os.makedirs(SNAPSHOT_DIR, exist_ok=True)

# Alert throttling configuration
ALERT_THROTTLE_SECONDS = 5
_last_alert_time = {}

# Note: All cooldown logic is now handled by Next.js via Firebase
# Python just does YOLO detection and triggers alerts via Next.js API

# Model setup
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"[INFO] Using device: {device}")
try:
    model = YOLO("best.pt").to(device)
    class_names = model.names
    print("[INFO] YOLO model loaded successfully.")
except Exception as e:
    print(f"[ERROR] Failed to load model: {e}")
    # Exit or handle the error appropriately if the model is critical
    exit()

# FastAPI app setup
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Be more specific in production, e.g., ["http://localhost:3000"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------
# Core Inference Logic
# ------------------------------
# Detection thresholds per class
CONF_THRESHOLDS = {
    "fire":  0.65,  # Fire needs higher confidence to avoid light bulb/sunlight false positives
    "smoke": 0.45,  # Smoke is harder to detect early — lower threshold
}

# Bounding box colors per class (BGR)
BOX_COLORS = {
    "fire":  (0, 80, 255),    # Orange-red for fire
    "smoke": (180, 170, 80),  # Blue-grey for smoke
}
DEFAULT_BOX_COLOR = (0, 200, 0)  # Green for other classes

def infer_and_draw(frame, camera_id=None):
    """Runs YOLO inference, draws bounding boxes, and triggers alerts for fire/smoke detections."""
    results = model(frame, imgsz=640, verbose=False)
    
    # Track best detection for alerting
    best_detection = None
    best_conf = 0.0
    
    for r in results:
        for box in r.boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            conf = float(box.conf[0])
            cls = int(box.cls[0])
            name = class_names[cls]
            
            # Choose color based on class
            color = BOX_COLORS.get(name, DEFAULT_BOX_COLOR)
            
            # Draw rectangle and label for all detections
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            label = f"{name} {conf:.2f}"
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 2)
            cv2.rectangle(frame, (x1, y1 - th - 8), (x1 + tw + 4, y1), color, -1)
            cv2.putText(frame, label, (x1 + 2, y1 - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 2)
            
            # Track highest confidence fire/smoke detection using per-class threshold
            threshold = CONF_THRESHOLDS.get(name, 0.75)
            if name in ["fire", "smoke"] and conf > threshold:
                if conf > best_conf:
                    best_conf = conf
                    best_detection = {
                        "class": name,
                        "confidence": conf,
                        "bbox": [x1, y1, x2, y2]
                    }
    
    # If fire detected, save snapshot and trigger alert via Next.js
    if best_detection:
        safe_camera_id = camera_id or os.getenv("DEFAULT_CAMERA_ID", "demo_camera")
        
        # Check throttle
        current_time = time.time()
        last_time = _last_alert_time.get(safe_camera_id, 0)
        
        if current_time - last_time < ALERT_THROTTLE_SECONDS:
            # Too soon, skip alert
            return frame
            
        try:
            # Update last alert time immediately to prevent race conditions
            _last_alert_time[safe_camera_id] = current_time

            # Save snapshot
            image_id = f"{uuid.uuid4()}.jpg"
            snapshot_path = os.path.join(SNAPSHOT_DIR, image_id)
            success = cv2.imwrite(snapshot_path, frame)
            
            if success:
                print(f"[PYTHON] 🔥 Fire detected: {best_detection['class']} ({best_detection['confidence']:.2f})")
                print(f"[PYTHON] 📸 Snapshot saved: {image_id}")
                
                # Trigger alert via Next.js client-trigger endpoint
                # This will handle Gemini verification and cooldown logic
                nextjs_url = os.getenv("NEXTJS_API_URL", "http://localhost:3000")
                alert_payload = {
                    "cameraId": safe_camera_id,
                    "imageId": image_id,
                    "className": best_detection["class"],
                    "confidence": best_detection["confidence"],
                    "bbox": best_detection["bbox"],
                    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
                }
                
                response = requests.post(
                    f"{nextjs_url}/api/alerts/client-trigger",
                    json=alert_payload,
                    headers={"Content-Type": "application/json"},
                    timeout=5
                )
                
                if response.status_code == 200:
                    print(f"[PYTHON] ✅ Alert triggered successfully for camera {safe_camera_id}")
                else:
                    print(f"[PYTHON] ⚠️ Alert trigger failed: {response.status_code} - {response.text}")
                    
        except Exception as e:
            print(f"[PYTHON] ❌ Error triggering alert: {e}")


    return frame



# ------------------------------
# Video Processing Generator
# ------------------------------
def process_video_stream(video_source, camera_id=None):
    """
    Opens a video source, processes each frame, and yields it as JPEG bytes.
    'video_source' can be a file path or a camera index (e.g., 0).
    'camera_id' is extracted from filename if not provided.
    """
    # Extract camera ID from filename if it's a file path and camera_id not provided
    if camera_id is None and isinstance(video_source, str) and os.path.isfile(video_source):
        filename = os.path.basename(video_source)
        if '_' in filename:
            camera_id = filename.split('_')[0]
            print(f"[INFO] Extracted camera ID from filename: {camera_id}")
    
    cap = cv2.VideoCapture(video_source)
    if not cap.isOpened():
        print(f"[ERROR] Could not open video source: {video_source}")
        return

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                print("[INFO] End of video stream.")
                break
            
            # Run inference with camera ID context
            processed_frame = infer_and_draw(frame, camera_id)
            
            # Encode frame as JPEG
            ret, buffer = cv2.imencode(".jpg", processed_frame)
            if not ret:
                print("[WARN] Failed to encode frame.")
                continue
                
            frame_bytes = buffer.tobytes()
            # Yield the frame in the format required for multipart/x-mixed-replace
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
    finally:
        cap.release()
        print(f"[INFO] Released video source: {video_source}")
        # Ensure temporary uploaded files are removed after streaming completes
        try:
            if isinstance(video_source, str) and os.path.isfile(video_source):
                os.remove(video_source)
                print(f"[CLEANUP] Deleted temporary video file: {video_source}")
        except Exception as e:
            print(f"[CLEANUP] Failed to delete video file {video_source}: {e}")


# ------------------------------
# Health / Keep-Alive Endpoint
# (UptimeRobot pings this every 10 min to prevent Render from sleeping)
# ------------------------------
@app.get("/health")
def health_check():
    """Lightweight health check endpoint for uptime monitoring."""
    return JSONResponse(content={
        "status": "ok",
        "service": "AgniShakti AI Backend",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    })

@app.get("/ping")
def ping():
    """Simple ping endpoint — returns pong."""
    return JSONResponse(content={"message": "pong"})

# ------------------------------
# API Endpoints
# ------------------------------
@app.post("/upload_video")
async def upload_video(video: UploadFile = File(...)):
    """
    Accepts a video file, saves it locally, and returns the filename
    for streaming.
    """
    # Generate a unique filename to avoid conflicts
    unique_filename = f"{uuid.uuid4()}_{video.filename}"
    file_path = os.path.join(TEMP_DIR, unique_filename)
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(video.file, buffer)
        return JSONResponse(content={"filename": unique_filename})
    except Exception as e:
        return JSONResponse(content={"error": f"Failed to save file: {e}"}, status_code=500)

@app.post("/upload_video/{camera_id}")
async def upload_video_for_camera(camera_id: str, video: UploadFile = File(...)):
    """
    Accepts a video file for a specific camera, saves it locally, and returns the filename
    for streaming. This endpoint associates the video with a specific camera ID.
    """
    # Generate a unique filename with camera ID prefix
    unique_filename = f"{camera_id}_{uuid.uuid4()}_{video.filename}"
    file_path = os.path.join(TEMP_DIR, unique_filename)
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(video.file, buffer)
        
        # Store camera ID mapping for this video
        camera_video_mapping = {
            "filename": unique_filename,
            "camera_id": camera_id,
            "original_filename": video.filename,
            "uploaded_at": None  # Will be set by backend if needed
        }
        
        return JSONResponse(content=camera_video_mapping)
    except Exception as e:
        return JSONResponse(content={"error": f"Failed to save file: {e}"}, status_code=500)

@app.get("/video_feed/{video_name}")
def video_feed(video_name: str):
    """Streams a processed video file from the temporary directory."""
    video_path = os.path.join(TEMP_DIR, video_name)
    if not os.path.exists(video_path):
        return JSONResponse(content={"error": "Video not found"}, status_code=404)
    
    # Extract camera_id from filename if it starts with camera_id_
    camera_id = None
    if '_' in video_name:
        potential_camera_id = video_name.split('_')[0]
        # Basic validation: camera IDs are typically alphanumeric and reasonable length
        if potential_camera_id and len(potential_camera_id) < 100:
            camera_id = potential_camera_id
            print(f"[INFO] Extracted camera ID from filename: {camera_id}")
        
    return StreamingResponse(process_video_stream(video_path, camera_id=camera_id), media_type="multipart/x-mixed-replace; boundary=frame")

@app.get("/video_feed/{camera_id}/{video_name}")
def video_feed_for_camera(camera_id: str, video_name: str):
    """Streams a processed video file for a specific camera."""
    video_path = os.path.join(TEMP_DIR, video_name)
    if not os.path.exists(video_path):
        return JSONResponse(content={"error": "Video not found"}, status_code=404)
    
    # Verify the video belongs to this camera (filename should start with camera_id)
    if not video_name.startswith(f"{camera_id}_"):
        return JSONResponse(content={"error": "Video does not belong to this camera"}, status_code=403)
        
    return StreamingResponse(process_video_stream(video_path, camera_id), media_type="multipart/x-mixed-replace; boundary=frame")

@app.get("/webcam_feed")
def webcam_feed():
    """Streams processed video from the primary webcam (index 0)."""
    return StreamingResponse(process_video_stream(0), media_type="multipart/x-mixed-replace; boundary=frame")

@app.get("/webcam_feed/{camera_id}")
def webcam_feed_for_camera(camera_id: str):
    """Streams processed video from the primary webcam (index 0) with a specific camera ID."""
    return StreamingResponse(process_video_stream(0, camera_id=camera_id), media_type="multipart/x-mixed-replace; boundary=frame")

# Note: reset-cooldown and switch-to-false-alarm endpoints removed
# Cooldown is now fully managed by Next.js via Firebase checkActiveAlert()

@app.get("/snapshots/{image_id}")
def get_snapshot(image_id: str):
    """Serves saved detection images by their unique ID."""
    snapshot_path = os.path.join(SNAPSHOT_DIR, image_id)
    
    if not os.path.exists(snapshot_path):
        raise HTTPException(status_code=404, detail="Image not found")
    
    return FileResponse(snapshot_path, media_type="image/jpeg")

@app.post("/capture_frame/{camera_id}")
async def capture_frame(camera_id: str):
    """
    Captures current frame from camera without triggering alerts.
    Used for periodic image updates during active alerts.
    Returns the imageId of the saved snapshot.
    """
    try:
        # Get camera ID, or use default webcam (0) if camera_id not found
        cap = cv2.VideoCapture(0)  # Using default webcam, can be enhanced to map camera_id to specific cameras
        
        ret, frame = cap.read()
        cap.release()
        
        if not ret or frame is None:
            return JSONResponse(
                content={"error": "Failed to capture frame from camera"},
                status_code=500
            )
        
        # Save the frame without running inference (no alert trigger)
        image_id = f"{uuid.uuid4()}.jpg"
        snapshot_path = os.path.join(SNAPSHOT_DIR, image_id)
        success = cv2.imwrite(snapshot_path, frame)
        
        if not success:
            return JSONResponse(
                content={"error": "Failed to save snapshot"},
                status_code=500
            )
        
        print(f"[PYTHON] [Capture Frame] Saved snapshot for camera {camera_id}: {image_id}")
        return JSONResponse(content={"imageId": image_id, "cameraId": camera_id})
        
    except Exception as e:
        print(f"[PYTHON] [Capture Frame] Error: {e}")
        return JSONResponse(
            content={"error": str(e)},
            status_code=500
        )

@app.get("/latest_snapshot/{camera_id}")
async def get_latest_snapshot(camera_id: str):
    """
    Returns the most recently saved snapshot ID for a camera.
    This gets the latest snapshot from the saved_snapshots directory.
    Used for periodic image updates during active alerts.
    """
    try:
        if not os.path.exists(SNAPSHOT_DIR):
            return JSONResponse(
                content={"error": "Snapshot directory not found", "imageId": None},
                status_code=404
            )
        
        # Get all snapshot files
        snapshot_files = [f for f in os.listdir(SNAPSHOT_DIR) if f.endswith('.jpg')]
        
        if not snapshot_files:
            return JSONResponse(
                content={"error": "No snapshots found", "imageId": None},
                status_code=404
            )
        
        # Sort by modification time (most recent first)
        snapshot_files.sort(
            key=lambda x: os.path.getmtime(os.path.join(SNAPSHOT_DIR, x)),
            reverse=True
        )
        
        # Return the most recent snapshot
        latest_image_id = snapshot_files[0]
        print(f"[PYTHON] [Latest Snapshot] Returning latest snapshot for camera {camera_id}: {latest_image_id}")
        return JSONResponse(content={"imageId": latest_image_id, "cameraId": camera_id})
        
    except Exception as e:
        print(f"[PYTHON] [Latest Snapshot] Error: {e}")
        return JSONResponse(
            content={"error": str(e), "imageId": None},
            status_code=500
        )

@app.post("/analyze_and_save_frame")
async def analyze_and_save_frame(
    file: UploadFile = File(...),
    camera_id: str = Form(default=None)
):
    """
    SIMPLIFIED: YOLO detection only - no Gemini verification here.
    If fire/smoke is detected above threshold, saves the image and returns detection.
    Gemini verification is handled by Next.js backend.
    """
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if frame is None:
            print("[PYTHON] ❌ Error: Could not decode image.")
            return JSONResponse(content={"error": "Could not decode image."}, status_code=400)

        # Run YOLO
        print("\n[PYTHON] ---------------- NEW FRAME ----------------")
        print("[PYTHON] ✅ Frame received. Running YOLO model...")
        
        results = model(frame, imgsz=640, verbose=False)
        
        best_detection = None
        
        # Log all detections
        found_anything = False
        for r in results:
            for box in r.boxes:
                conf = float(box.conf[0].item())
                cls_id = int(box.cls[0].item())
                class_name = model.names[cls_id]
                
                print(f"[PYTHON]   - Found: {class_name} (Confidence: {conf:.2f})")
                found_anything = True
                
                # Check if it's fire/smoke above per-class threshold
                threshold = CONF_THRESHOLDS.get(class_name, 0.75)
                if class_name in ['fire', 'smoke'] and conf > threshold:
                    if best_detection is None or conf > best_detection["confidence"]:
                        best_detection = {
                            "class": class_name,
                            "confidence": conf,
                            "bbox": box.xyxy[0].tolist()
                        }
        
        if not found_anything:
            print("[PYTHON]   - Model found no objects in this frame.")
        
        if best_detection:
            # Fire detected by YOLO - save image and return
            image_id = f"{uuid.uuid4()}.jpg"
            snapshot_path = os.path.join(SNAPSHOT_DIR, image_id)
            
            success = cv2.imwrite(snapshot_path, frame)
            if not success:
                print(f"[PYTHON] ❌ Error: Failed to save snapshot.")
                return JSONResponse(content={"error": "Failed to save snapshot."}, status_code=500)
            
            print(f"[PYTHON] 🔥 YOLO detected {best_detection['class']} ({best_detection['confidence']:.2f}). Image saved: {image_id}")
            print("[PYTHON] ➡️ Sending to Next.js for Gemini verification...")
            
            return JSONResponse(content={
                "detection": best_detection,
                "imageId": image_id
            })
        else:
            # No fire detected
            print("[PYTHON] ✅ No fire detected above 0.75 threshold.")
            return JSONResponse(content={"detection": None, "imageId": None})

    except Exception as e:
        print(f"[PYTHON] ❌ CRITICAL ERROR in /analyze_and_save_frame: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)