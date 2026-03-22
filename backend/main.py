#!/usr/bin/env python3
# ================================
# 🔧 CHOOSE TEST MODE
# Uncomment ONE of the following lines:

TEST_MODE = "video"   # ▶ Replace VIDEO_PATH below with your file
# TEST_MODE = "webcam"   # ▶ Use webcam for testing

# 🎥 If using video mode, set the path here:
VIDEO_PATH = r"D:\AgniShakti\AgniShakti\Firefighter s Raw POV.mp4"   # <<--- REPLACE THIS PATH

# Path to your trained YOLOv8 model:
MODEL_PATH = r"D:\AgniShakti\AgniShakti\best.pt"
# ================================

import torch
import time
import argparse
import os
from collections import deque, defaultdict
import csv
import math

import cv2
import numpy as np
import pandas as pd 
from ultralytics import YOLO
# ---------------------------
# Utility / Config
# ---------------------------
DEFAULT_IMG_SIZE = 640
TARGET_FPS = 30.0          # desired playback fps for preview
ADAPT_WINDOW = 20          # number of frames to average inference times over
MIN_SCALE = 0.3            # don't downscale below this fraction of original
SCALE_STEP = 0.8           # multiply scale by this when reducing quality
MAX_SKIP = 5               # maximum frames to skip between inference passes

# Colors for boxes (BGR)
BOX_COLOR = (0, 0, 255)    # red for fire/smoke
TEXT_COLOR = (255, 255, 255)

# ---------------------------
# Helpers
# ---------------------------
def safe_mkdir(d):
    if d and not os.path.exists(d):
        os.makedirs(d)

def draw_boxes(frame, boxes, confidences, classes, class_names=None):
    """Draw boxes on frame. boxes = [[x1,y1,x2,y2], ...]"""
    for i, (box, conf, cls) in enumerate(zip(boxes, confidences, classes)):
        x1, y1, x2, y2 = map(int, box)
        label = f"{class_names[int(cls)] if class_names else int(cls)} {conf:.2f}"
        cv2.rectangle(frame, (x1, y1), (x2, y2), BOX_COLOR, 2)
        # put label background
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        cv2.rectangle(frame, (x1, y1 - th - 6), (x1 + tw + 4, y1), BOX_COLOR, -1)
        cv2.putText(frame, label, (x1 + 2, y1 - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.5, TEXT_COLOR, 1, cv2.LINE_AA)

def box_iou(boxA, boxB):
    # boxes are [x1,y1,x2,y2]
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])

    interW = max(0, xB - xA)
    interH = max(0, yB - yA)
    interArea = interW * interH
    boxAArea = max(0, boxA[2] - boxA[0]) * max(0, boxA[3] - boxA[1])
    boxBArea = max(0, boxB[2] - boxB[0]) * max(0, boxB[3] - boxB[1])
    union = boxAArea + boxBArea - interArea
    if union == 0:
        return 0.0
    return interArea / union

# ---------------------------
# Core inference loop
# ---------------------------
class InferenceRunner:
    def __init__(self, model_paths, class_names=None, device=None, imgsz=DEFAULT_IMG_SIZE, save_log_dir="logs"):
        """
        model_paths: list of .pt strings (can be single)
        class_names: optional list mapping class ids to names
        """
        if isinstance(model_paths, str):
            model_paths = [model_paths]
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"[INFO] Using device: {device}")
        self.models = [YOLO(m).to(device) for m in model_paths]  # loads model(s)
        self.model_paths = model_paths
        self.class_names = class_names or []
        self.imgsz = imgsz
        self.save_log_dir = save_log_dir
        safe_mkdir(save_log_dir)
        # stats
        self.infer_times = [deque(maxlen=ADAPT_WINDOW) for _ in self.models]
        self.frame_count = 0
        self.logs = defaultdict(list)  # per-model lists of per-frame stats

    def _infer_frame(self, model_index, frame):
        """Run inference on a single frame and return boxes, confs, classes."""
        model = self.models[model_index]
        t0 = time.time()
        # ultralytics: model(frame) returns Results object or list
        results = model(frame, imgsz=self.imgsz, verbose=False)  # returns list-like of Results
        t1 = time.time()
        infer_time = t1 - t0
        # parse results[0].boxes
        r = results[0]
        boxes = []
        confs = []
        classes = []
        if hasattr(r, "boxes") and r.boxes is not None:
            for b in r.boxes:
                # b.xyxy, b.conf, b.cls
                xyxy = b.xyxy.cpu().numpy().flatten().tolist()  # flatten in case it’s 2D
                conf = float(b.conf.item())  # safely get scalar
                cls = int(b.cls.item())
                boxes.append(xyxy)
                confs.append(conf)
                classes.append(cls)
        return boxes, confs, classes, infer_time

    def adaptive_control(self, times_deque, current_scale, current_skip):
        """Given a deque of recent inference times, decide whether to scale down or skip frames more."""
        if len(times_deque) == 0:
            return current_scale, current_skip
        avg_inf = sum(times_deque) / len(times_deque)
        achieved_fps = 1.0 / avg_inf if avg_inf > 1e-6 else 999
        # If inference fps is much lower than target, reduce quality or skip frames:
        if achieved_fps < TARGET_FPS * 0.8:
            # first increase skip up to MAX_SKIP, then reduce scale
            if current_skip < MAX_SKIP:
                current_skip = min(MAX_SKIP, current_skip + 1)
            else:
                new_scale = max(MIN_SCALE, current_scale * SCALE_STEP)
                current_scale = new_scale
        elif achieved_fps > TARGET_FPS * 1.2:
            # if we are faster, reduce skipping and raise quality a bit
            if current_skip > 0:
                current_skip = max(0, current_skip - 1)
            else:
                current_scale = min(1.0, current_scale / SCALE_STEP)  # slightly increase scale
        return current_scale, current_skip

    def run_live(self, source=0, use_webcam=False, model_index=0, show=True):
        """
        source: video path or RTSP or webcam index
        model_index: which model to run (0-based). If multiple models are provided and you want to compare,
                     use evaluate_models() instead.
        """
        if use_webcam:
            cap = cv2.VideoCapture(int(source), cv2.CAP_DSHOW)
        else:
            cap = cv2.VideoCapture(source)
        if not cap.isOpened():
            raise RuntimeError(f"Could not open source: {source}")
        orig_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        orig_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        print(f"[INFO] opened source: {source}, resolution {orig_w}x{orig_h}")

        scale = 1.0
        skip = 0
        frame_idx = 0
        last_drawn_frame = None

        while True:
            ret, frame = cap.read()
            if not ret:
                print("[INFO] End of stream or cannot read frame.")
                break
            frame_idx += 1

            # decide whether to run inference on this frame (skipping to maintain speed)
            if frame_idx % (skip + 1) != 0 and last_drawn_frame is not None:
                # reuse last drawn frame for display, optionally update timestamp overlay
                if show:
                    display = last_drawn_frame.copy()
                    now = time.strftime("%Y-%m-%d %H:%M:%S")
                    cv2.putText(display, f"FPS(Target={TARGET_FPS}) Skip={skip} Scale={scale:.2f}",
                                (10, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
                    cv2.imshow("Detection", display)
                    if cv2.waitKey(1) & 0xFF == ord('q'):
                        break
                continue

            # optionally resize (scale) before inference
            if scale < 1.0:
                small = cv2.resize(frame, (int(frame.shape[1]*scale), int(frame.shape[0]*scale)))
            else:
                small = frame

            # inference
            boxes, confs, classes, infer_time = self._infer_frame(model_index, small)
            # adjust boxes back to original coordinates if scaled
            if scale != 1.0 and len(boxes) > 0:
                factor_x = frame.shape[1] / small.shape[1]
                factor_y = frame.shape[0] / small.shape[0]
                boxes = [[b[0]*factor_x, b[1]*factor_y, b[2]*factor_x, b[3]*factor_y] for b in boxes]

            # log stats
            self.infer_times[model_index].append(infer_time)
            self.logs[self.model_paths[model_index]].append({
                "frame": frame_idx,
                "infer_time": infer_time,
                "n_detections": len(boxes),
                "mean_conf": (sum(confs)/len(confs) if confs else 0.0)
            })
            self.frame_count += 1

            # draw on frame to display
            display = frame.copy()
            if boxes:
                draw_boxes(display, boxes, confs, classes, class_names=self.class_names)
            now = time.strftime("%Y-%m-%d %H:%M:%S")
            cv2.putText(display, f"FPS(Target={TARGET_FPS}) Skip={skip} Scale={scale:.2f}",
                        (10, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
            cv2.putText(display, f"Model: {os.path.basename(self.model_paths[model_index])}",
                        (10, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)

            last_drawn_frame = display.copy()
            if show:
                cv2.imshow("Detection", display)
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    break

            # adaptive control based on recent inference times
            scale, skip = self.adaptive_control(self.infer_times[model_index], scale, skip)

        cap.release()
        if show:
            cv2.destroyAllWindows()

    def evaluate_models_on_video(self, video_path, save_csv=True, gt_annotations=None, iou_threshold=0.5):
        """
        Run each model on the same video, log basic metrics.
        gt_annotations: optional dict mapping frame_idx -> list of gt boxes [[x1,y1,x2,y2,class], ...]
                        If provided, compute IoU-based precision/recall (one-to-one greedy matching).
        Returns a pandas DataFrame with summary stats for each model.
        """
        summaries = []
        for midx, model_path in enumerate(self.model_paths):
            print(f"[EVAL] Running model {model_path} on {video_path}")
            cap = cv2.VideoCapture(video_path)
            if not cap.isOpened():
                print(f"[EVAL] Cannot open {video_path}")
                continue
            frame_idx = 0
            per_frame_stats = []
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                frame_idx += 1
                boxes, confs, classes, inf_t = self._infer_frame(midx, frame)
                n_det = len(boxes)
                mean_conf = sum(confs) / n_det if n_det else 0.0
                matched = 0
                tp = 0
                fp = 0
                fn = 0
                if gt_annotations and frame_idx in gt_annotations:
                    gts = gt_annotations[frame_idx]
                    gt_matched = [False]*len(gts)
                    for b in boxes:
                        best_iou = 0
                        best_j = -1
                        for j, g in enumerate(gts):
                            iou = box_iou(b, g[:4])
                            if iou > best_iou:
                                best_iou = iou
                                best_j = j
                        if best_iou >= iou_threshold:
                            if not gt_matched[best_j]:
                                tp += 1
                                gt_matched[best_j] = True
                            else:
                                fp += 1
                        else:
                            fp += 1
                    fn = sum(1 for matched_flag in gt_matched if not matched_flag)
                else:
                    # Without GT we cannot compute precision/recall
                    tp = fp = fn = None

                per_frame_stats.append({
                    "frame": frame_idx,
                    "infer_time": inf_t,
                    "n_detections": n_det,
                    "mean_conf": mean_conf,
                    "tp": tp, "fp": fp, "fn": fn
                })
            cap.release()

            df = pd.DataFrame(per_frame_stats)
            mean_infer = df['infer_time'].mean()
            detections_per_frame = df['n_detections'].mean()
            mean_conf = df['mean_conf'].mean()

            # compute aggregated precision/recall if GT present
            if gt_annotations:
                TP = df['tp'].sum()
                FP = df['fp'].sum()
                FN = df['fn'].sum()
                precision = TP / (TP + FP) if (TP + FP) > 0 else 0.0
                recall = TP / (TP + FN) if (TP + FN) > 0 else 0.0
            else:
                precision = recall = None

            summary = {
                "model": model_path,
                "mean_infer_time_s": mean_infer,
                "detections_per_frame": detections_per_frame,
                "mean_confidence": mean_conf,
                "precision": precision,
                "recall": recall
            }
            summaries.append(summary)

            # save per-frame csv for this model
            if save_csv:
                out_csv = os.path.join(self.save_log_dir, f"perframe_{os.path.basename(model_path)}.csv")
                df.to_csv(out_csv, index=False)
                print(f"[EVAL] saved per-frame CSV: {out_csv}")

        summary_df = pd.DataFrame(summaries)
        if save_csv:
            summary_csv = os.path.join(self.save_log_dir, "summary_models.csv")
            summary_df.to_csv(summary_csv, index=False)
            print(f"[EVAL] saved summary CSV: {summary_csv}")
        return summary_df

# ---------------------------
# CLI
# ---------------------------
def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--model", help="path to single .pt model file (mutually exclusive with --models)", type=str)
    p.add_argument("--models", nargs='+', help="paths to multiple .pt model files for evaluation", type=str)
    p.add_argument("--video", help="path to video file or RTSP stream", type=str)
    p.add_argument("--webcam", help="use webcam. pass index (0 default) or leave blank", nargs='?', const="0", type=str)
    p.add_argument("--compare", action="store_true", help="run evaluation of multiple models on video (--models required)")
    p.add_argument("--imgsz", type=int, default=DEFAULT_IMG_SIZE, help="inference image size for model (default 640)")
    p.add_argument("--save_logs", type=str, default="logs", help="directory to save csv logs")
    return p.parse_args()
def main():
    # Load your model (auto GPU if available)
    runner = InferenceRunner([MODEL_PATH], imgsz=DEFAULT_IMG_SIZE, save_log_dir="logs")

    if TEST_MODE == "video":
        print(f"[MAIN] Running on video file: {VIDEO_PATH}")
        runner.run_live(source=VIDEO_PATH, use_webcam=False, model_index=0, show=True)

    elif TEST_MODE == "webcam":
        print("[MAIN] Running on webcam (index 0)")
        runner.run_live(source=0, use_webcam=True, model_index=0, show=True)

    else:
        print("ERROR: Invalid TEST_MODE. Please choose 'video' or 'webcam' at the top of the script.")

if __name__ == "__main__":
    main()