// src/backend/backend.js
// Server-side backend helper functions for Agnishakti
// Use only from server (API routes or Node.js process).
import { GoogleGenAI } from "@google/genai";
import { db } from "@/lib/firebase"; // your firebase admin firestore instance
import admin from "firebase-admin";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import { sendWhatsAppAlertToAll, buildAlertMessage } from "@/lib/whatsapp";

const DEFAULT_SNAPSHOT_TTL_SEC = 60 * 60 * 24 * 7; // 7 days signed url expiry

/** --------------------------
 * Helper utilities
 * -------------------------- */

/** Normalize emails used as Firestore doc IDs */
export function normalizeEmail(email) {
  if (!email || typeof email !== "string") {
    throw new Error("Invalid email: must be a non-empty string");
  }

  const trimmed = email.trim().toLowerCase();

  // Basic email validation
  if (!trimmed.includes('@') || !trimmed.includes('.')) {
    throw new Error(`Invalid email format: ${email}. Must contain @ and domain`);
  }

  return trimmed;
}

/** Simple Haversine distance (km) */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Get Storage bucket (admin.storage) */
function getStorageBucket() {
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || null;
  if (bucketName) return admin.storage().bucket(bucketName);
  return admin.storage().bucket(); // default
}

/**
 * Upload a snapshot from the Python AI service to Firebase Storage.
 * Makes the file publicly readable and returns a permanent public URL.
 *
 * @param {string} imageId   - Filename like "uuid.jpg" stored in Python's saved_snapshots/
 * @param {string} alertId   - Alert document ID (used to namespace the path in Storage)
 * @returns {Promise<string>} - Public URL: https://storage.googleapis.com/{bucket}/snapshots/{alertId}/{imageId}
 */
export async function uploadSnapshotToFirebaseStorage(imageId, alertId) {
  if (!imageId || !alertId) {
    throw new Error("[Storage] imageId and alertId are required");
  }

  try {
    const bucket = getStorageBucket();
    const pythonUrl = `${process.env.PYTHON_SERVICE_URL || "http://127.0.0.1:8000"}/snapshots/${imageId}`;

    // Fetch the image from the Python AI service
    const response = await fetch(pythonUrl, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      throw new Error(`[Storage] Failed to fetch snapshot from Python: HTTP ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());

    // Upload to Firebase Storage at: snapshots/{alertId}/{imageId}
    const destPath = `snapshots/${alertId}/${imageId}`;
    const file = bucket.file(destPath);

    await file.save(buffer, {
      contentType: "image/jpeg",
      public: true, // Make the file publicly readable
      metadata: {
        cacheControl: "public, max-age=3600",
        metadata: { alertId, imageId, uploadedAt: new Date().toISOString() },
      },
    });

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destPath}`;
    console.log(`[Storage] ✅ Snapshot uploaded: ${publicUrl}`);
    return publicUrl;
  } catch (err) {
    console.error(`[Storage] ❌ Failed to upload snapshot ${imageId}:`, err.message);
    throw err;
  }
}

/** Save base64 JPEG locally in /public/uploads and return URL */
export async function uploadSnapshotBase64({ base64Image, destinationPath }) {
  if (!base64Image || !destinationPath) throw new Error("Missing snapshot or path");

  const matches = base64Image.match(/^data:image\/\w+;base64,(.*)$/);
  const payload = matches ? matches[1] : base64Image;
  const buffer = Buffer.from(payload, "base64");

  const uploadDir = path.join(process.cwd(), "public", "uploads");
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const safeFileName = destinationPath.replace(/[\\/]/g, "-");
  const filePath = path.join(uploadDir, safeFileName);

  fs.writeFileSync(filePath, buffer);

  return `/uploads/${safeFileName}`;
}

/** Nodemailer transport (reads env vars) */
function getMailTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    throw new Error("SMTP env vars not configured (SMTP_HOST/SMTP_USER)");
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: (process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
}

/**
 * Convert Python service URL to Next.js API proxy URL for external access
 * Handles both full URLs and relative paths
 */
function getPublicImageUrl(imageUrl) {
  if (!imageUrl) return null;

  // If it's already a Next.js API URL, return as-is
  if (imageUrl.includes('/api/snapshots/')) {
    // Extract the base URL from environment or use default
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000';
    // If it's already a full URL, return as-is
    if (imageUrl.startsWith('http')) {
      return imageUrl;
    }
    // If it's relative, make it absolute
    return `${baseUrl}${imageUrl.startsWith('/') ? imageUrl : '/' + imageUrl}`;
  }

  // Extract imageId from Python service URL (e.g., http://127.0.0.1:8000/snapshots/uuid.jpg)
  let imageId = null;
  if (imageUrl.includes('/snapshots/')) {
    imageId = imageUrl.split('/snapshots/')[1];
  } else if (imageUrl.includes('http')) {
    // If it's a full URL but not our format, return as-is (might be external)
    return imageUrl;
  } else {
    // If it's just an imageId/filename, use it directly
    imageId = imageUrl;
  }

  if (!imageId) return imageUrl; // Fallback to original URL

  // Construct Next.js API proxy URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000';
  return `${baseUrl}/api/snapshots/${imageId}`;
}

/** send alert email to owner and provider (one mail per recipient) */
export async function sendAlertEmail({ toEmail, subject, textBody, htmlBody, imageUrl }) {
  const transporter = getMailTransporter();
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;

  const mailOptions = {
    from,
    to: toEmail,
    subject,
    text: textBody,
    html: htmlBody,
  };

  if (imageUrl) {
    // Convert to public-accessible Next.js API URL
    const publicImageUrl = getPublicImageUrl(imageUrl);
    mailOptions.html = (htmlBody || "") + `<p><a href="${publicImageUrl}" target="_blank">View detection image</a></p><p><img src="${publicImageUrl}" alt="Fire detection snapshot" style="max-width: 100%; height: auto;" /></p>`;
  }

  const info = await transporter.sendMail(mailOptions);
  return info;
}

// verifyWithGemini will be added later in the new alert pipeline section

/** --------------------------
 * Users (docs keyed by normalized email)
 * -------------------------- */

/**
 * registerUser
 * - Creates or merges a user document where doc ID = normalized email
 * - Only sets createdAt if user doesn't exist
 * - Firestore collections are automatically created on first write
 */
export async function registerUser({ name, email, role = "owner" }) {
  try {
    console.log('registerUser called with:', { name, email, role });
    const safeEmail = normalizeEmail(email);
    console.log('Normalized email:', safeEmail);

    const userRef = db.collection("users").doc(safeEmail);

    // Check if user already exists
    console.log('Checking if user exists...');
    const existingUser = await userRef.get();
    console.log('User exists:', existingUser.exists);

    const data = {
      name: name || "",
      email: safeEmail,
      role,
    };

    // Only set createdAt if this is a new user
    if (!existingUser.exists) {
      data.createdAt = admin.firestore.FieldValue.serverTimestamp();
      console.log('New user - setting createdAt');
    } else {
      console.log('Existing user - preserving createdAt');
    }

    console.log('Writing user data to Firestore...');
    await userRef.set(data, { merge: true });
    console.log('User document written successfully');

    return { success: true, email: safeEmail };
  } catch (error) {
    console.error('registerUser failed:', error.message);
    console.error('Stack:', error.stack);
    throw error;
  }
}

/**
 * getUserByEmail
 */
export async function getUserByEmail(email) {
  const safeEmail = normalizeEmail(email);
  const doc = await db.collection("users").doc(safeEmail).get();
  if (!doc.exists) return null;
  return doc.data();
}

/**
 * assignRole
 */
export async function assignRole(email, role) {
  const safeEmail = normalizeEmail(email);
  await db.collection("users").doc(safeEmail).set({ role }, { merge: true });
  return { success: true };
}

/** --------------------------
 * Houses
 * -------------------------- */

/**
 * createHouse
 * - ownerEmail (string) - will be normalized
 * - address (string)
 * - coords {lat, lng}
 * - monitorPassword (plaintext) - will be hashed & stored
 * - Automatically calculates and assigns nearest fire station
 * - Creates document in 'houses' collection (auto-created on first write)
 */
export async function createHouse({ ownerEmail, address, coords, monitorPassword }) {
  const safeEmail = normalizeEmail(ownerEmail);
  const housesRef = db.collection("houses").doc(); // auto id
  const houseId = housesRef.id;

  const salt = bcrypt.genSaltSync(10);
  const passwordHash = monitorPassword ? bcrypt.hashSync(monitorPassword, salt) : null;

  // Automatically find nearest fire station based on house coordinates
  let nearestFireStationId = null;
  if (coords && coords.lat && coords.lng) {
    const nearestStation = await findNearestFireStation(coords);
    nearestFireStationId = nearestStation ? nearestStation.stationId : null;
  }

  const payload = {
    houseId,
    ownerEmail: safeEmail,
    address: address || "",
    coords: coords || null,
    nearestFireStationId: nearestFireStationId,
    monitoringEnabled: true,
    monitorPasswordHash: passwordHash,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await housesRef.set(payload);
  return { success: true, houseId };
}

/**
 * getHousesByOwnerEmail
 */
export async function getHousesByOwnerEmail(ownerEmail) {
  const safeEmail = normalizeEmail(ownerEmail);
  const snap = await db.collection("houses").where("ownerEmail", "==", safeEmail).get();
  return snap.docs.map((d) => d.data());
}

/**
 * getHouseById
 */
export async function getHouseById(houseId) {
  const doc = await db.collection("houses").doc(houseId).get();
  if (!doc.exists) return null;
  return doc.data();
}

/**
 * updateHouse (partial updates)
 * - updates object can include address, coords, nearestFireStationId, monitoringEnabled
 */
export async function updateHouse(houseId, updates = {}) {
  if (!houseId) throw new Error("houseId required");
  const safeUpdates = { ...updates, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
  await db.collection("houses").doc(houseId).set(safeUpdates, { merge: true });
  return { success: true };
}

/**
 * setHouseMonitorPassword
 */
export async function setHouseMonitorPassword(houseId, newPassword) {
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(newPassword, salt);
  await db.collection("houses").doc(houseId).set({ monitorPasswordHash: hash }, { merge: true });
  return { success: true };
}

/**
 * verifyHousePassword
 */
export async function verifyHousePassword(houseId, candidatePassword) {
  const doc = await db.collection("houses").doc(houseId).get();
  if (!doc.exists) throw new Error("House not found");
  const data = doc.data();
  if (!data.monitorPasswordHash) return false;
  const ok = bcrypt.compareSync(candidatePassword, data.monitorPasswordHash);
  return ok;
}

/**
 * deleteHouse
 * - Deletes a house document from Firestore.
 * - Also deletes all associated camera documents (cascade delete)
 */
export async function deleteHouse(houseId) {
  if (!houseId) throw new Error("houseId required");

  // First, find and delete all cameras associated with this house
  console.log(`Deleting house ${houseId} and its associated cameras...`);
  const camerasSnapshot = await db.collection("cameras").where("houseId", "==", houseId).get();

  if (!camerasSnapshot.empty) {
    console.log(`Found ${camerasSnapshot.size} camera(s) to delete`);
    // Delete each camera document
    const deletePromises = camerasSnapshot.docs.map(doc => doc.ref.delete());
    await Promise.all(deletePromises);
    console.log(`Deleted ${camerasSnapshot.size} camera(s) for house ${houseId}`);
  } else {
    console.log(`No cameras found for house ${houseId}`);
  }

  // Then delete the house document itself
  await db.collection("houses").doc(houseId).delete();
  console.log(`House ${houseId} deleted successfully`);

  return { success: true };
}


/** --------------------------
 * Cameras
 * -------------------------- */

/**
 * addCamera
 * - houseId
 * - label
 * - source (rtsp, local-usb, etc.)
 * - streamType (rtsp|usb|webrtc|other)
 * - Creates document in 'cameras' collection (auto-created on first write)
 */
export async function addCamera({ houseId, label, source, streamType = "rtsp" }) {
  if (!houseId) throw new Error("houseId required");
  const cameraRef = db.collection("cameras").doc();
  const cameraId = cameraRef.id;
  const payload = {
    cameraId,
    houseId,
    label: label || "",
    source: source || "",
    streamType,
    isMonitoring: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastSeen: null,
  };
  await cameraRef.set(payload);
  return { success: true, cameraId };
}

/**
 * getCamerasByHouse
 */
export async function getCamerasByHouse(houseId) {
  const snap = await db.collection("cameras").where("houseId", "==", houseId).get();
  return snap.docs.map((d) => d.data());
}

/**
 * getCamerasByOwnerEmail
 * - collects all houses for owner then queries cameras using 'in' (chunked)
 */
export async function getCamerasByOwnerEmail(ownerEmail) {
  const safeEmail = normalizeEmail(ownerEmail);
  const housesSnap = await db.collection("houses").where("ownerEmail", "==", safeEmail).get();
  const houseIds = housesSnap.docs.map((d) => d.id || d.data().houseId).filter(Boolean);
  if (houseIds.length === 0) return [];

  const chunkSize = 10;
  const results = [];
  for (let i = 0; i < houseIds.length; i += chunkSize) {
    const chunk = houseIds.slice(i, i + chunkSize);
    const camerasSnap = await db.collection("cameras").where("houseId", "in", chunk).get();
    camerasSnap.forEach((d) => results.push(d.data()));
  }
  return results;
}

/**
 * updateCamera
 */
export async function updateCamera(cameraId, updates = {}) {
  await db.collection("cameras").doc(cameraId).set({ ...updates, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  return { success: true };
}

/**
 * deleteCamera
 */
export async function deleteCamera(cameraId) {
  await db.collection("cameras").doc(cameraId).delete();
  return { success: true };
}

/**
 * startMonitoring / stopMonitoring
 */
export async function startMonitoring(cameraId) {
  await db.collection("cameras").doc(cameraId).set({ isMonitoring: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  return { success: true };
}

export async function stopMonitoring(cameraId) {
  await db.collection("cameras").doc(cameraId).set({ isMonitoring: false, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  return { success: true };
}

/** --------------------------
 * Fire Stations & provider assignment
 * -------------------------- */

/**
 * addFireStation
 * - station: { name, phone, email, coords }
 * - Creates document in 'fireStations' collection (auto-created on first write)
 */
export async function addFireStation(station) {
  const ref = db.collection("fireStations").doc();
  const stationId = ref.id;
  const payload = {
    stationId,
    ...station,
    providerEmail: normalizeEmail(station.email),
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };
  await ref.set(payload);
  return { success: true, stationId };
}

/**
 * registerFireStation
 * - High-level function that handles the entire provider registration flow.
 * - Automatically creates user in 'users' collection if they don't exist
 * - Creates fire station in 'fireStations' collection (auto-created on first write)
 * - Links station to provider in user's assignedStations array
 */
export async function registerFireStation({ email, name, stationName, stationAddress, stationPhone, coords }) {
  try {
    console.log('=== registerFireStation called ===');
    console.log('Input params:', { email, name, stationName, stationAddress, stationPhone, coords });

    // Create or update user as provider (users collection auto-created on first write)
    console.log('Step 1: Creating/updating user as provider...');
    const userResult = await registerUser({ name, email, role: 'provider' });
    console.log('User created/updated:', userResult);

    // Create fire station document (fireStations collection auto-created on first write)
    console.log('Step 2: Creating fire station document...');
    const stationData = {
      name: stationName,
      address: stationAddress,
      phone: stationPhone,
      email: normalizeEmail(email),
      coords
    };
    console.log('Station data:', stationData);
    const { stationId } = await addFireStation(stationData);
    console.log('Fire station created with ID:', stationId);

    // Link station to provider's assignedStations array
    console.log('Step 3: Linking station to provider...');
    await assignStationToProvider(email, stationId);
    console.log('Station linked to provider successfully');

    const result = { success: true, userEmail: normalizeEmail(email), stationId };
    console.log('=== registerFireStation completed successfully ===', result);
    return result;
  } catch (error) {
    console.error('=== registerFireStation failed ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    throw error;
  }
}

/**
 * findNearestFireStation(houseCoords)
 */
export async function findNearestFireStation({ lat, lng }) {
  const snap = await db.collection("fireStations").get();
  if (snap.empty) return null;
  let best = null;
  snap.forEach((d) => {
    const data = d.data();
    if (!data.coords) return;
    const dist = haversineKm(lat, lng, data.coords.lat, data.coords.lng);
    if (!best || dist < best.dist) best = { station: data, dist };
  });
  return best ? best.station : null;
}

/**
 * assignStationToProvider
 * - updates user's assignedStations array
 */
export async function assignStationToProvider(providerEmail, stationId) {
  const safeEmail = normalizeEmail(providerEmail);
  await db.collection("users").doc(safeEmail).set({ assignedStations: admin.firestore.FieldValue.arrayUnion(stationId) }, { merge: true });
  return { success: true };
}

/**
 * getProviderAssignedStations
 */
export async function getProviderAssignedStations(providerEmail) {
  const safeEmail = normalizeEmail(providerEmail);
  const userDoc = await db.collection("users").doc(safeEmail).get();
  if (!userDoc.exists) return [];
  const data = userDoc.data();
  return data.assignedStations || [];
}

/**
 * getProviderDashboardData(providerEmail)
 */
export async function getProviderDashboardData(providerEmail) {
  const stationIds = await getProviderAssignedStations(providerEmail);
  /* 
   * MERGED LOGIC:
   * 1. Get alerts for houses assigned to provider's stations strategy
   * 2. Get alerts where provider was explicitly dispatched (dynamic strategy)
   */

  const houses = [];
  const alertsByHouse = {};

  // 1. Process Static Alerts (by houseId) - ONLY if stations assigned
  if (stationIds && stationIds.length > 0) {
    const chunkSize = 10;
    for (let i = 0; i < stationIds.length; i += chunkSize) {
      const chunk = stationIds.slice(i, i + chunkSize);
      const snap = await db.collection("houses").where("nearestFireStationId", "in", chunk).get();
      snap.forEach((d) => houses.push(d.data()));
    }

    const houseIds = houses.map((h) => h.houseId);
    if (houseIds.length) {
      for (let i = 0; i < houseIds.length; i += chunkSize) {
        const chunk = houseIds.slice(i, i + chunkSize);
        const alertsSnap = await db.collection("alerts")
          .where("houseId", "in", chunk)
          .where("status", "in", ["CONFIRMED_BY_GEMINI", "SENDING_NOTIFICATIONS", "NOTIFIED_COOLDOWN", "DISPATCHED"])
          .get();
        alertsSnap.forEach((a) => {
          const ad = a.data();
          alertsByHouse[ad.houseId] = alertsByHouse[ad.houseId] || [];
          alertsByHouse[ad.houseId].push(ad);
        });
      }
    }
  }

  // 2. Process Dynamic Dispatched Alerts (Explicitly dispatched to this provider)
  const safeProviderEmail = normalizeEmail(providerEmail);
  console.log(`[NEXT_BACKEND] [Dashboard] Checking dispatched alerts for: ${safeProviderEmail}`);

  try {
    const dispatchedSnap = await db.collection("alerts")
      .where("dispatchedEmails", "array-contains", safeProviderEmail)
      .where("status", "==", "DISPATCHED")
      .get();

    console.log(`[NEXT_BACKEND] [Dashboard] Found ${dispatchedSnap.size} dynamic dispatched alerts.`);

    for (const doc of dispatchedSnap.docs) {
      const alert = doc.data();
      console.log(`[NEXT_BACKEND] [Dashboard] Processing dynamic alert: ${alert.alertId} for house ${alert.houseId}`);

      // Add alert to map (deduplicate if already found via static assignment)
      alertsByHouse[alert.houseId] = alertsByHouse[alert.houseId] || [];
      const exists = alertsByHouse[alert.houseId].find(a => a.alertId === alert.alertId);
      if (!exists) {
        alertsByHouse[alert.houseId].push(alert);
      }

      // Ensure we have the house logic. If the house wasn't fetched via static assignment, fetch it now.
      const houseExists = houses.find(h => h.houseId === alert.houseId);
      if (!houseExists) {
        console.log(`[NEXT_BACKEND] [Dashboard] Dynamic house ${alert.houseId} not in static list. Fetching...`);
        const houseDoc = await db.collection("houses").doc(alert.houseId).get();
        if (houseDoc.exists) {
          houses.push(houseDoc.data());
        } else {
          console.warn(`[NEXT_BACKEND] [Dashboard] House ${alert.houseId} matches alert but document not found.`);
        }
      }
    }
  } catch (err) {
    console.error("[NEXT_BACKEND] [Dashboard] Error fetching dispatched alerts:", err);
  }

  return houses.map((h) => ({ ...h, activeAlerts: alertsByHouse[h.houseId] || [] }));
}

// =================================================================
// --- NEW MASTER ALERT PIPELINE (REPLACES OLD triggerAlert) ---
// =================================================================

/**
 * [ALERT_PIPELINE] STEP 1 (NEW): Check for active alerts.
 * This is our "spam protection" gatekeeper.
 */
export async function checkActiveAlert(cameraId) {
  console.log(`[NEXT_BACKEND] [Alert Spam Check] Checking for active alerts for camera: ${cameraId}`);
  const q = db.collection("alerts")
    .where("cameraId", "==", cameraId)
    .where("status", "in", [
      "PENDING",
      "CONFIRMED_BY_GEMINI",
      "SENDING_NOTIFICATIONS",
      "NOTIFIED_COOLDOWN",
      "DISPATCHED"
    ]);

  const snap = await q.get();
  if (snap.empty) {
    console.log(`[NEXT_BACKEND] [Alert Spam Check] ✅ OK. No active alert found.`);
    return null; // No active alert, OK to proceed.
  }

  const alertDoc = snap.docs[0];
  const alertId = alertDoc.id;
  const alertData = alertDoc.data();

  // Check if alert is stale (stuck for too long without updates)
  const now = Date.now();
  const createdAt = alertData.createdAt?.toDate ? alertData.createdAt.toDate().getTime() : new Date(alertData.createdAt).getTime();
  const updatedAt = alertData.updatedAt?.toDate ? alertData.updatedAt.toDate().getTime() : (alertData.updatedAt ? new Date(alertData.updatedAt).getTime() : createdAt);
  const ageSeconds = (now - createdAt) / 1000;
  const lastUpdateSeconds = (now - updatedAt) / 1000;

  // If alert is PENDING and older than 2 minutes, or last updated more than 90 seconds ago, it's stale
  // More aggressive cleanup to prevent blocking
  const isStalePending = alertData.status === "PENDING" && (ageSeconds > 120 || lastUpdateSeconds > 90);
  const isStaleConfirmed = alertData.status === "CONFIRMED_BY_GEMINI" && lastUpdateSeconds > 180; // 3 minutes without email sending

  if (isStalePending || isStaleConfirmed) {
    console.warn(`[NEXT_BACKEND] [Alert Spam Check] ⚠️ Alert ${alertId} is STALE (status: ${alertData.status}, age: ${ageSeconds.toFixed(0)}s, lastUpdate: ${lastUpdateSeconds.toFixed(0)}s). Auto-cleaning...`);

    // Auto-clean stale alerts: delete them immediately to unblock new detections
    try {
      // Delete immediately to unblock - stale alerts should be removed
      await deleteAlert(alertId);
      console.log(`[NEXT_BACKEND] [Alert Spam Check] ✅ Deleted stale ${alertData.status} alert ${alertId} (age: ${ageSeconds.toFixed(0)}s)`);
      // Return null to allow new alert to proceed immediately
      return null;
    } catch (cleanupErr) {
      console.error(`[NEXT_BACKEND] [Alert Spam Check] ❌ Failed to clean stale alert ${alertId}:`, cleanupErr);
      // Even if cleanup fails, try to proceed (better than being stuck forever)
      return null;
    }
  }

  // Check NOTIFIED_COOLDOWN expiry
  if (alertData.status === "NOTIFIED_COOLDOWN" && alertData.cooldownExpiresAt) {
    const cooldownExpiry = alertData.cooldownExpiresAt.toDate ? alertData.cooldownExpiresAt.toDate().getTime() : new Date(alertData.cooldownExpiresAt).getTime();
    const remainingSeconds = Math.max(0, (cooldownExpiry - now) / 1000);
    const remainingMinutes = Math.floor(remainingSeconds / 60);
    const remainingSecsDisplay = Math.floor(remainingSeconds % 60);

    if (now > cooldownExpiry) {
      console.log(`[NEXT_BACKEND] [Alert Spam Check] ⏰ Cooldown expired for alert ${alertId}. Allowing new alerts.`);
      // Delete the expired cooldown alert
      try {
        await db.collection("alerts").doc(alertId).delete();
        console.log(`[NEXT_BACKEND] [Alert Spam Check] ✅ Deleted expired cooldown alert ${alertId}`);
        return null; // OK to proceed
      } catch (deleteErr) {
        console.error(`[NEXT_BACKEND] [Alert Spam Check] ❌ Failed to delete expired alert:`, deleteErr);
      }
    } else {
      // Cooldown still active - BLOCK new alerts
      console.warn(`[NEXT_BACKEND] [Alert Spam Check] 🚫 BLOCKED: Camera ${cameraId} is in 15-min cooldown. Time remaining: ${remainingMinutes}m ${remainingSecsDisplay}s`);
      console.warn(`[NEXT_BACKEND] [Alert Spam Check] 🚫 Alert ${alertId} will expire at: ${new Date(cooldownExpiry).toLocaleTimeString()}`);
      return alertData; // Return existing alert to block new one
    }
  }

  console.warn(`[NEXT_BACKEND] [Alert Spam Check] ❌ REJECTED. Alert ${alertId} is already active (status: ${alertData.status}).`);
  return alertData;
}

/**
 * [ALERT_PIPELINE] STEP 2 (NEW): Create the "PENDING" alert.
 * This is the "fast" function called by the frontend.
 * It creates the alert and starts the Gemini check in the background.
 */
export async function createPendingAlert(payload) {
  const { cameraId, className, confidence, bbox, timestamp, imageId } = payload;

  console.log(`[NEXT_BACKEND] [Alert Pipeline] 1. createPendingAlert called for: ${cameraId}`);

  // 1. Get Camera and House info
  const camDoc = await db.collection("cameras").doc(cameraId).get();
  if (!camDoc.exists) throw new Error("Camera not found");
  const houseId = camDoc.data().houseId;

  // 2. Build REAL snapshot URL
  let snapshotUrl;
  if (!imageId) {
    throw new Error("imageId is required");
  }
  if (imageId.startsWith('http')) {
    // It's already a full URL, use it as-is
    snapshotUrl = imageId;
    console.log(`[NEXT_BACKEND] [Alert Pipeline] 1a. Received a full URL for imageId.`);
  } else {
    // It's just a filename, build the URL
    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || "http://127.0.0.1:8000";
    snapshotUrl = `${pythonServiceUrl}/snapshots/${imageId}`;
    console.log(`[NEXT_BACKEND] [Alert Pipeline] 1a. Built URL from imageId: ${snapshotUrl}`);
  }

  // 3. Create PENDING alert
  const alertRef = db.collection("alerts").doc();
  const alertPayload = {
    alertId: alertRef.id,
    cameraId,
    houseId,
    status: "PENDING", // User 30s-timer is now active
    detectionImage: snapshotUrl, // The REAL, working URL
    className, confidence, bbox,
    createdAt: admin.firestore.Timestamp.now(), // Always a Firestore Timestamp for consistent serialization
    geminiCheck: null,
  };
  await alertRef.set(alertPayload);

  console.log(`[NEXT_BACKEND] [Alert Pipeline] 2. PENDING alert ${alertRef.id} created.`);

  // 4. Start Gemini check (Fire-and-forget, no await)
  // This runs in the background
  console.log(`[NEXT_BACKEND] [Alert Pipeline] 3. Starting Gemini check (fire-and-forget) for alert ${alertRef.id}...`);
  runGeminiVerification(alertRef.id, snapshotUrl).catch(err => {
    // Catch any unhandled errors in the background task
    console.error(`[NEXT_BACKEND] [Alert Pipeline] 3x. Unhandled error in runGeminiVerification for ${alertRef.id}:`, err);
  });
  console.log(`[NEXT_BACKEND] [Alert Pipeline] 3. Gemini check started (no-await). Function call completed.`);

  return { alertId: alertRef.id };
}

/**
 * [ALERT_PIPELINE] STEP 3 (NEW - Stolen from friend): Run Gemini check.
 * This is the background task.
 */
async function runGeminiVerification(alertId, snapshotUrl) {
  try {
    console.log(`[NEXT_BACKEND] [Alert Pipeline] 3a. (Background) Gemini verification starting for ${alertId}...`);
    console.log(`[NEXT_BACKEND] [Alert Pipeline] 3b. (Background) Snapshot URL: ${snapshotUrl}`);

    const geminiRes = await verifyWithGemini({ imageUrl: snapshotUrl });
    console.log(`[NEXT_BACKEND] [Alert Pipeline] 3c. (Background) Gemini response received:`, {
      isFire: geminiRes.isFire,
      score: geminiRes.score,
      reason: geminiRes.reason?.substring(0, 100)
    });

    const alertRef = db.collection("alerts").doc(alertId);
    const alertDoc = await alertRef.get();

    if (!alertDoc.exists) {
      console.error(`[NEXT_BACKEND] [Alert Pipeline] 3d. (Background) Alert ${alertId} not found in database!`);
      return;
    }

    const currentStatus = alertDoc.data().status;
    console.log(`[NEXT_BACKEND] [Alert Pipeline] 3e. (Background) Current alert status: ${currentStatus}`);

    // Only update if the alert is still PENDING (i.e., user hasn't cancelled)
    if (currentStatus === "PENDING") {
      const updateData = {
        status: geminiRes.isFire ? "CONFIRMED_BY_GEMINI" : "REJECTED_BY_GEMINI",
        geminiCheck: geminiRes,
        updatedAt: admin.firestore.FieldValue.serverTimestamp() // Track when status was updated
      };

      console.log(`[NEXT_BACKEND] [Alert Pipeline] 3f. (Background) Updating alert ${alertId} with status: ${updateData.status}`);

      await alertRef.set(updateData, { merge: true });

      // Verify the update succeeded
      const verifyDoc = await alertRef.get();
      const verifyStatus = verifyDoc.exists ? verifyDoc.data().status : "NOT_FOUND";
      console.log(`[NEXT_BACKEND] [Alert Pipeline] 3g. (Background) Update verified. New status: ${verifyStatus}`);

      if (geminiRes.isFire) {
        console.log(`[NEXT_BACKEND] [Alert Pipeline] 4a. (Background) ✅ Gemini confirmed REAL fire for ${alertId}.`);

        // ─── IMMEDIATE WHATSAPP TO OWNER ──────────────────────────────────
        // Send WhatsApp to the owner right now (don't wait for the 30s countdown to expire)
        try {
          const alertData = alertDoc.data();
          const immediateHouseDoc = await db.collection("houses").doc(alertData.houseId).get();
          if (immediateHouseDoc.exists) {
            const immediateOwnerEmail = immediateHouseDoc.data().ownerEmail;
            const immediateOwnerDoc = await db.collection("users").doc(immediateOwnerEmail).get();
            const immediateOwner = immediateOwnerDoc.exists ? immediateOwnerDoc.data() : {};

            // Determine recipient: owner's saved number OR env fallback
            const waTo = immediateOwner.whatsappNumber ||
              (process.env.WHATSAPP_ALERT_NUMBERS || "").split(",").map(n => n.trim()).filter(Boolean)[0];

            if (waTo) {
              const { sendWhatsAppAlert } = await import("@/lib/whatsapp");
              const { buildAlertMessage } = await import("@/lib/whatsapp");
              
              // 1. Upload snapshot to Firebase Storage to get a public URL for Twilio
              let publicMediaUrl = null;
              try {
                // Extract imageId from the detection image URL (e.g. http://127.0.0.1:8000/snapshots/uuid.jpg → uuid.jpg)
                const imageIdToUpload = alertData.imageId || (snapshotUrl ? snapshotUrl.split('/snapshots/').pop() : null);
                if (imageIdToUpload) {
                  publicMediaUrl = await uploadSnapshotToFirebaseStorage(imageIdToUpload, alertId);
                }
              } catch (storageErr) {
                console.warn(`[NEXT_BACKEND] [Alert Pipeline] 4a-WA. ⚠️ Firebase Storage upload failed: ${storageErr.message}`);
              }

              const waMsg = buildAlertMessage({
                className: alertData.className || "fire",
                confidence: alertData.confidence,
                alertId,
                isUpdate: false,
              });
              
              await sendWhatsAppAlert({ 
                to: waTo, 
                message: waMsg,
                mediaUrl: publicMediaUrl || undefined 
              });
              console.log(`[NEXT_BACKEND] [Alert Pipeline] 4a-WA. ✅ Immediate WhatsApp sent to owner: ${waTo}`);
            } else {
              console.warn(`[NEXT_BACKEND] [Alert Pipeline] 4a-WA. ⚠️ No WhatsApp number for owner ${immediateOwnerEmail}. Check their profile.`);
            }
          }
        } catch (waImmediateErr) {
          console.warn(`[NEXT_BACKEND] [Alert Pipeline] 4a-WA. ⚠️ Immediate WhatsApp failed (non-fatal): ${waImmediateErr.message}`);
        }
        // ─── END IMMEDIATE WHATSAPP ──────────────────────────────────────

        try {
          // --- DISPATCH LOGIC START ---
          const alertData = alertDoc.data();
          const houseDoc = await db.collection("houses").doc(alertData.houseId).get();

          if (houseDoc.exists) {
            const houseData = houseDoc.data();
            if (houseData.coords && houseData.coords.lat && houseData.coords.lng) {

              // 1. Find Nearest Online Responders (Max 5, 50km radius)
              const responders = await findNearestOnlineResponders(
                houseData.coords.lat,
                houseData.coords.lng,
                50,
                5
              );

              if (responders.length > 0) {
                // 2. Dispatch Alerts
                const dispatchLog = [];
                for (const r of responders) {
                  try {
                    console.log(`[NEXT_BACKEND] [Dispatch] Sending alert to ${r.email} (${r.distKm.toFixed(1)}km)`);
                    await sendAlertEmail({
                      toEmail: r.email,
                      subject: `🔥 URGENT: FIRE DISPATCH - ${r.distKm.toFixed(1)}km away`,
                      textBody: `Emergency at ${houseData.address}. Distance: ${r.distKm.toFixed(1)}km. Status: ${geminiRes.reason}`,
                      htmlBody: `
                                <h2>🔥 FIRE DISPATCH ORDER</h2>
                                <p><strong>Location:</strong> ${houseData.address}</p>
                                <p><strong>Distance:</strong> ${r.distKm.toFixed(1)}km</p>
                                <p><strong>Severity:</strong> CRITICAL</p>
                                <p><strong>AI Assessment:</strong> ${geminiRes.reason}</p>
                                <p><a href="https://www.google.com/maps/dir/?api=1&destination=${houseData.coords.lat},${houseData.coords.lng}">Navigate to Location</a></p>
                              `,
                      imageUrl: snapshotUrl
                    });
                    dispatchLog.push({
                      responderId: r.email,
                      distKm: r.distKm,
                      dispatchedAt: new Date().toISOString()
                    });
                  } catch (sendErr) {
                    console.error(`[NEXT_BACKEND] [Dispatch] Failed to email ${r.email}:`, sendErr);
                  }
                }

                // 3. Update Alert State if anyone was Dispatched
                if (dispatchLog.length > 0) {
                  const dispatchedEmails = dispatchLog.map(d => d.responderId);
                  await alertRef.set({
                    status: "DISPATCHED",
                    dispatchedResponders: dispatchLog,
                    dispatchedEmails: dispatchedEmails // New field for array-contains query
                  }, { merge: true });
                  console.log(`[NEXT_BACKEND] [Alert Pipeline] 4b. ✅ SUCCESSFULLY DISPATCHED to ${dispatchLog.length} nearest responders.`);
                } else {
                  console.warn(`[NEXT_BACKEND] [Alert Pipeline] 4b. ⚠️ No dispatch emails succeeded.`);
                }
              } else {
                console.warn(`[NEXT_BACKEND] [Alert Pipeline] 4b. ⚠️ No nearby ONLINE responders found.`);
              }
            } else {
              console.warn(`[NEXT_BACKEND] [Alert Pipeline] 4b. ⚠️ House ${alertData.houseId} has no coordinates. Cannot dispatch.`);
            }
          }
          // --- DISPATCH LOGIC END ---
        } catch (dispatchErr) {
          console.error(`[NEXT_BACKEND] [Alert Pipeline] 4b. ❌ Critical Dispatch Error:`, dispatchErr);
        }

      } else {
        console.log(`[NEXT_BACKEND] [Alert Pipeline] 4b. (Background) ❌ Gemini rejected FAKE fire for ${alertId}.`);
        // No need to notify Python - cooldown is handled by Firebase via checkActiveAlert()
      }
    } else {
      console.log(`[NEXT_BACKEND] [Alert Pipeline] 4c. (Background) Gemini finished, but alert ${alertId} status is ${currentStatus} (not PENDING). No update.`);
    }
  } catch (err) {
    console.error(`[NEXT_BACKEND] [Alert Pipeline] 4d. (Background) ❌ Gemini verification FAILED for ${alertId}:`, err);
    console.error(`[NEXT_BACKEND] [Alert Pipeline] 4d. Error details:`, {
      message: err.message,
      stack: err.stack,
      code: err.code,
      details: err.details
    });

    try {
      const alertRef = db.collection("alerts").doc(alertId);
      await alertRef.set({
        status: "REJECTED_BY_GEMINI",
        geminiCheck: {
          isFire: false,
          reason: `Gemini API failed: ${err.message}`,
          error: err.message
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp() // Track when status was updated
      }, { merge: true });
      console.log(`[NEXT_BACKEND] [Alert Pipeline] 4e. (Background) Alert ${alertId} marked as REJECTED_BY_GEMINI due to error.`);
    } catch (dbErr) {
      console.error(`[NEXT_BACKEND] [Alert Pipeline] 4f. (Background) ❌ Failed to update alert after Gemini error:`, dbErr);
    }
  }
}

/**
 * [ALERT_PIPELINE] STEP 4 (NEW): The user's "Cancel" button.
 * This is called by the new /cancel API route.
 */
export async function cancelAlertByUser(alertId, userEmail) {
  console.log(`[NEXT_BACKEND] [Alert Pipeline] 5a. User attempting to CANCEL alert: ${alertId}`);
  const alertRef = db.collection("alerts").doc(alertId);
  const doc = await alertRef.get();
  if (!doc.exists) throw new Error("Alert not found");

  const status = doc.data().status;
  // Allow cancellation if it's PENDING or if Gemini just rejected it (the race condition)
  if (status === "PENDING" || status === "REJECTED_BY_GEMINI" || status === "CONFIRMED_BY_GEMINI") {
    await alertRef.set({
      status: "CANCELLED_BY_USER",
      canceledBy: userEmail || "unknown_user",
      canceledAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    console.log(`[NEXT_BACKEND] [Alert Pipeline] 5b. ✅ Success. Alert ${alertId} set to CANCELLED_BY_USER.`);
    return { success: true };
  } else {
    console.warn(`[NEXT_BACKEND] [Alert Pipeline] 5c. ❌ FAILED to cancel alert ${alertId}. Status is already ${status}.`);
    return { success: false, message: "Alert is already finalized." };
  }
}


/**
 * [ALERT_PIPELINE] STEP 5 (NEW): The "Email Gatekeeper"
 * Called by frontend after 30s timer expires.
 */
export async function confirmAndSendAlerts(alertId) {
  console.log(`[NEXT_BACKEND] [Alert Pipeline] 6. "Gatekeeper" (confirmAndSend) received for alert: ${alertId}`);

  const alertRef = db.collection("alerts").doc(alertId);
  const alertDoc = await alertRef.get();
  if (!alertDoc.exists) {
    console.error(`[NEXT_BACKEND] [Alert Pipeline] ❌ FAILED: Alert ${alertId} not found.`);
    throw new Error("Alert not found.");
  }

  const alert = alertDoc.data();
  const { status, cameraId, houseId, className, detectionImage, geminiCheck } = alert;

  // This is the "Gatekeeper" logic
  if (status === "CANCELLED_BY_USER") {
    console.log(`[NEXT_BACKEND] [Alert Pipeline] 7a. Alert ${alertId} was CANCELLED BY USER. Deleting.`);
    await deleteAlert(alertId);
    return { ok: true, message: "Alert was cancelled by user." };
  }

  if (status === "REJECTED_BY_GEMINI") {
    console.log(`[NEXT_BACKEND] [Alert Pipeline] 7b. Alert ${alertId} was REJECTED BY GEMINI. Deleting.`);
    await deleteAlert(alertId);
    return { ok: true, message: "Alert was rejected by Gemini." };
  }

  if (status === "NOTIFIED_COOLDOWN" || status === "SENDING_NOTIFICATIONS") {
    console.warn(`[NEXT_BACKEND] [Alert Pipeline] 7c. Alert ${alertId} is already processing/sent. Doing nothing.`);
    return { ok: true, message: "Alert already processed." };
  }

  if (status !== "CONFIRMED_BY_GEMINI") {
    // This can happen if the timer expires *before* Gemini finishes (e.g., Gemini is slow)
    console.warn(`[NEXT_BACKEND] [Alert Pipeline] 7d. ⏳ Alert ${alertId} is NOT YET confirmed by Gemini. Status: ${status}. Will retry.`);
    return { ok: false, message: `Alert not confirmed. Status: ${status}` };
  }

  // --- IF WE REACH HERE, IT'S A "GO" ---
  console.log(`[NEXT_BACKEND] [Alert Pipeline] 8. ✅ GO SIGNAL! Alert ${alertId} is CONFIRMED_BY_GEMINI. Sending emails...`);
  await alertRef.set({ status: "SENDING_NOTIFICATIONS" }, { merge: true });

  try {
    // Now we run the "slow" email logic.
    const houseDoc = await db.collection("houses").doc(houseId).get();
    const house = houseDoc.data();
    const ownerEmail = house.ownerEmail;
    const ownerDoc = await db.collection("users").doc(ownerEmail).get();
    const owner = ownerDoc.exists ? ownerDoc.data() : { email: ownerEmail };

    // REAL-TIME DISPATCH: Find nearest ACTIVE responder based on live location
    let station = null;
    let dispatchMethod = 'none';

    try {
      const { dispatchAlertToNearestResponder } = require('./alertDispatch');
      const dispatchResult = await dispatchAlertToNearestResponder(
        alertId,
        house.coords,
        { className, detectionImage, geminiCheck },
        db
      );

      if (dispatchResult.success) {
        station = {
          email: dispatchResult.dispatchedTo.responderEmail,
          name: dispatchResult.dispatchedTo.responderEmail.split('@')[0],
          coords: dispatchResult.dispatchedTo.currentLocation
        };
        dispatchMethod = 'real_time_active_responder';
        console.log(`[NEXT_BACKEND] [Alert Pipeline] 8a. ✅ Dispatched to ACTIVE responder: ${station.email} (${dispatchResult.distance.toFixed(2)} km away)`);
      }
    } catch (dispatchError) {
      console.warn(`[NEXT_BACKEND] [Alert Pipeline] 8a. ⚠️ Real-time dispatch failed: ${dispatchError.message}`);
      console.log(`[NEXT_BACKEND] [Alert Pipeline] 8a. Falling back to nearest fire station...`);
    }

    // Fallback: Use the existing findNearestFireStation function if real-time dispatch failed
    if (!station) {
      station = await findNearestFireStation(house.coords);
      dispatchMethod = 'fallback_nearest_station';
      console.log(`[NEXT_BACKEND] [Alert Pipeline] 8a. Using fallback station: ${station?.name || 'None'}`);
    }

    const gpsLink = house.coords ? `http://maps.google.com/?q=${house.coords.lat},${house.coords.lng}` : null;
    const attachImage = !geminiCheck.sensitive;
    const snapshotUrl = detectionImage; // Use the real URL from the alert doc

    // Send Owner Email
    const subjectOwner = `URGENT: Fire detected at ${house.address}`;
    const htmlOwner = `<p>Dear ${owner.name || "Owner"},</p><p>We detected ${className} at your property (${house.address}). Gemini AI has confirmed this is a real fire.</p><p><a href="${gpsLink}" target="_blank">Open location in Google Maps</a></p>`;
    await sendAlertEmail({
      toEmail: owner.email || ownerEmail,
      subject: subjectOwner,
      htmlBody: htmlOwner,
      imageUrl: attachImage ? snapshotUrl : null,
    });
    console.log(`[NEXT_BACKEND] [Alert Pipeline] 8b. Sent email to Owner: ${owner.email}`);

    // Send Fire Station Email (to active responder or fallback station)
    if (station && station.email) {
      const subjectStation = `ALERT: Fire at ${house.address}`;
      const htmlStation = `<p>Fire alert at ${house.address}</p><p>House owner: ${owner.email}</p><p>Gemini AI has confirmed this is a real fire.</p><p>Dispatch method: ${dispatchMethod}</p><p><a href="${gpsLink}" target="_blank">Navigate</a></p>`;
      await sendAlertEmail({
        toEmail: station.email,
        subject: subjectStation,
        htmlBody: htmlStation,
        imageUrl: attachImage ? snapshotUrl : null,
      });
      console.log(`[NEXT_BACKEND] [Alert Pipeline] 8c. Sent email to ${dispatchMethod === 'real_time_active_responder' ? 'Active Responder' : 'Station'}: ${station.email}`);
    }

    // 8d. WhatsApp Alert — Upload snapshot to Firebase Storage + send WhatsApp
    let firebaseImageUrl = null;
    try {
      // Extract imageId from the detection image URL (e.g. http://127.0.0.1:8000/snapshots/uuid.jpg → uuid.jpg)
      const imageId = alert.imageId || (detectionImage ? detectionImage.split('/snapshots/').pop() : null);
      if (imageId) {
        firebaseImageUrl = await uploadSnapshotToFirebaseStorage(imageId, alertId);
      }
    } catch (storageErr) {
      console.warn(`[NEXT_BACKEND] [Alert Pipeline] 8d. ⚠️ Firebase Storage upload failed: ${storageErr.message}`);
    }

    const waMessage = buildAlertMessage({
      className,
      confidence: alert.confidence,
      alertId,
      isUpdate: false,
    });

    try {
      // Build recipient list: prioritize owner's saved WhatsApp number from Firestore
      const waRecipients = [];

      // 1. Owner's WhatsApp number (from their profile)
      if (owner.whatsappNumber) {
        waRecipients.push(owner.whatsappNumber);
        console.log(`[NEXT_BACKEND] [Alert Pipeline] 8d. Owner WhatsApp: ${owner.whatsappNumber}`);
      } else {
        console.warn(`[NEXT_BACKEND] [Alert Pipeline] 8d. ⚠️ Owner ${ownerEmail} has no whatsappNumber saved in profile.`);
      }

      // 2. Fallback: env var WHATSAPP_ALERT_NUMBERS (if owner has no number saved)
      if (waRecipients.length === 0) {
        const envNumbers = (process.env.WHATSAPP_ALERT_NUMBERS || "")
          .split(",").map(n => n.trim()).filter(Boolean);
        waRecipients.push(...envNumbers);
        if (envNumbers.length > 0) {
          console.log(`[NEXT_BACKEND] [Alert Pipeline] 8d. Using env fallback numbers: ${envNumbers.join(", ")}`);
        }
      }

      if (waRecipients.length === 0) {
        console.warn(`[NEXT_BACKEND] [Alert Pipeline] 8d. ⚠️ No WhatsApp recipients found. Skipping.`);
      } else {
        const { sendWhatsAppAlert } = await import("@/lib/whatsapp");
        const results = await Promise.allSettled(
          waRecipients.map(to => sendWhatsAppAlert({
            to,
            message: waMessage,
            mediaUrl: firebaseImageUrl || undefined,
          }))
        );
        const sent = results.filter(r => r.status === "fulfilled").length;
        const failed = results.filter(r => r.status === "rejected").length;
        console.log(`[NEXT_BACKEND] [Alert Pipeline] 8d. ✅ WhatsApp alerts — sent: ${sent}, failed: ${failed}`);
      }
    } catch (waErr) {
      // WhatsApp failure should NOT block the alert pipeline
      console.warn(`[NEXT_BACKEND] [Alert Pipeline] 8d. ⚠️ WhatsApp sending error: ${waErr.message}`);
    }

    // 9. Set to "Cooldown" - 15 minutes to prevent repeated alerts
    await alertRef.set({
      status: "NOTIFIED_COOLDOWN",
      cooldownExpiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 10 * 60 * 1000), // 10 mins (was 15)
      sentEmails: { ownerSent: true, stationSent: !!(station && station.email) },
      whatsappAlertSent: true,
      firebaseImageUrl: firebaseImageUrl || null,
      whatsappUpdateCount: 0,
      lastWhatsappUpdate: new Date(),
    }, { merge: true });

    console.log(`[NEXT_BACKEND] [Alert Pipeline] 9. ✅ Emails + WhatsApp sent. Alert ${alertId} set to NOTIFIED_COOLDOWN.`);
    return { ok: true, alertId, status: "NOTIFIED_COOLDOWN" };

  } catch (emailErr) {
    console.error(`[NEXT_BACKEND] [Alert Pipeline] 10. ❌ CRITICAL: Email sending failed for ${alertId}.`, emailErr);
    await alertRef.set({ status: "CONFIRMED_BY_GEMINI", error: "Failed to send emails" }, { merge: true }); // Reset
    return { ok: false, message: "Email sending failed." };
  }
}

/**
 * [ALERT_PIPELINE] STEP 6 (NEW): Update the image during cooldown.
 * This is for the 30s image update.
 */
export async function updateAlertImage(alertId, newImageId) {
  console.log(`[NEXT_BACKEND] [Alert Pipeline] Cooldown: Updating image for ${alertId} to ${newImageId}`);
  const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || "http://127.0.0.1:8000";
  const snapshotUrl = `${pythonServiceUrl}/snapshots/${newImageId}`;

  await db.collection("alerts").doc(alertId).set({
    detectionImage: snapshotUrl,
    lastImageUpdate: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  return { success: true, newImageUrl: snapshotUrl };
}

/**
 * [ALERT_PIPELINE] STEP 8: Update images for active alerts every 30 seconds
 * This function requests new snapshots from Python service for active alerts
 */
export async function updateActiveAlertImages() {
  try {
    console.log(`[NEXT_BACKEND] [Image Update] Starting periodic image update for active alerts...`);

    // Get all active alerts
    const activeStatuses = ["CONFIRMED_BY_GEMINI", "SENDING_NOTIFICATIONS", "NOTIFIED_COOLDOWN", "DISPATCHED"];
    const activeAlertsSnapshot = await db.collection("alerts")
      .where("status", "in", activeStatuses)
      .get();

    if (activeAlertsSnapshot.empty) {
      console.log(`[NEXT_BACKEND] [Image Update] No active alerts to update.`);
      return { updated: 0 };
    }

    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || "http://127.0.0.1:8000";
    let updatedCount = 0;
    const updatePromises = [];

    for (const alertDoc of activeAlertsSnapshot.docs) {
      const alert = alertDoc.data();
      const alertId = alertDoc.id;
      const cameraId = alert.cameraId;

      // Skip image updates for alerts whose cooldown has already expired
      if (alert.status === "NOTIFIED_COOLDOWN" && alert.cooldownExpiresAt) {
        const expiresAt = alert.cooldownExpiresAt.toDate
          ? alert.cooldownExpiresAt.toDate().getTime()
          : new Date(alert.cooldownExpiresAt).getTime();
        if (Date.now() >= expiresAt) {
          console.log(`[NEXT_BACKEND] [Image Update] Alert ${alertId} cooldown has expired — skipping image update.`);
          continue;
        }
      }

      // Skip if last update was less than 25 seconds ago (to avoid too frequent updates)
      const lastUpdate = alert.lastImageUpdate;
      if (lastUpdate) {
        const lastUpdateTime = lastUpdate.toDate ? lastUpdate.toDate().getTime() : new Date(lastUpdate).getTime();
        const secondsSinceUpdate = (Date.now() - lastUpdateTime) / 1000;
        if (secondsSinceUpdate < 25) {
          console.log(`[NEXT_BACKEND] [Image Update] Alert ${alertId} updated ${secondsSinceUpdate.toFixed(1)}s ago, skipping.`);
          continue;
        }
      }

      // Get the latest snapshot from Python service (from saved_snapshots directory)
      // First try latest_snapshot, fallback to capture_frame if needed
      updatePromises.push(
        (async () => {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            // Try to get latest saved snapshot first (more efficient)
            let response = await fetch(`${pythonServiceUrl}/latest_snapshot/${cameraId}`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
              },
              signal: controller.signal,
            });

            // If no saved snapshot, capture a new one
            if (response.status === 404) {
              clearTimeout(timeoutId);
              const controller2 = new AbortController();
              const timeoutId2 = setTimeout(() => controller2.abort(), 5000);

              response = await fetch(`${pythonServiceUrl}/capture_frame/${cameraId}`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                signal: controller2.signal,
              });

              clearTimeout(timeoutId2);
            } else {
              clearTimeout(timeoutId);
            }

            if (!response.ok) {
              throw new Error(`Python service returned ${response.status}`);
            }

            const data = await response.json();
            if (data.imageId) {
              // Update alert with the latest snapshot (using same URL format)
              await updateAlertImage(alertId, data.imageId);
              console.log(`[NEXT_BACKEND] [Image Update] ✅ Updated image for alert ${alertId} (camera: ${cameraId}) to latest snapshot: ${data.imageId}`);
              updatedCount++;
            } else {
              console.warn(`[NEXT_BACKEND] [Image Update] No imageId in response for alert ${alertId}`);
            }
          } catch (err) {
            if (err.name === 'AbortError') {
              console.error(`[NEXT_BACKEND] [Image Update] ❌ Timeout updating image for alert ${alertId}`);
            } else {
              console.error(`[NEXT_BACKEND] [Image Update] ❌ Failed to update image for alert ${alertId}: ${err.message}`);
            }
          }
        })()
      );
    }

    await Promise.all(updatePromises);
    console.log(`[NEXT_BACKEND] [Image Update] ✅ Updated ${updatedCount} alert images.`);
    return { updated: updatedCount };
  } catch (error) {
    console.error(`[NEXT_BACKEND] [Image Update] ❌ Error in updateActiveAlertImages:`, error);
    return { updated: 0, error: error.message };
  }
}

/**
 * [ALERT_PIPELINE] STEP 7 (NEW): The cleanup functions.
 * This is for your auto-delete requirement.
 */
export async function deleteAlert(alertId) {
  await db.collection("alerts").doc(alertId).delete();
  console.log(`[NEXT_BACKEND] [Alert Pipeline] Cleanup: Deleted alert ${alertId}.`);
  return { success: true };
}

// This is for a cron job to run to clean up old alerts
export async function cleanupResolvedAlerts() {
  console.log(`[NEXT_BACKEND] [Alert Pipeline] Cron: Running cleanupResolvedAlerts...`);
  const now = admin.firestore.Timestamp.now();
  const q = db.collection("alerts")
    .where("cooldownExpiresAt", "<=", now);

  const snap = await q.get();
  if (snap.empty) {
    console.log(`[NEXT_BACKEND] [Alert Pipeline] Cron: No resolved alerts to delete.`);
    return { deleted: 0 };
  }

  const deletePromises = [];
  snap.docs.forEach(doc => {
    console.log(`[NEXT_BACKEND] [Alert Pipeline] Cron: Deleting resolved alert ${doc.id}`);
    deletePromises.push(doc.ref.delete());
  });

  await Promise.all(deletePromises);
  console.log(`[NEXT_BACKEND] [Alert Pipeline] Cron: Cleaned up ${snap.size} resolved alerts.`);
  return { deleted: snap.size };
}

/**
 * [ALERT_PIPELINE] Gemini AI Fire Verification
 * Uses direct REST API calls for reliability.
 * Supports multiple API keys for quota exhaustion fallback.
 * Tested working models as of January 2026.
 */
export async function verifyWithGemini({ imageUrl }) {
  // Get all API keys (comma-separated in env)
  const apiKeysRaw = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
  const apiKeys = apiKeysRaw.split(",").map(k => k.trim()).filter(k => k.length > 0);
  const enableGemini = (process.env.ENABLE_GEMINI || "false").toLowerCase() === "true";

  console.log("[NEXT_BACKEND] [Gemini] verifyWithGemini called");
  console.log("[NEXT_BACKEND] [Gemini] ENABLE_GEMINI:", enableGemini);
  console.log("[NEXT_BACKEND] [Gemini] API Keys available:", apiKeys.length);
  console.log("[NEXT_BACKEND] [Gemini] Image URL:", imageUrl);

  if (!enableGemini || apiKeys.length === 0) {
    console.warn("[NEXT_BACKEND] [Gemini] Verification disabled or no API keys. ENABLE_GEMINI=" + enableGemini);
    return {
      isFire: true, score: 0.95,
      reason: "Gemini verification disabled - defaulting to fire detected",
      action: "trigger_alert",
      sensitive: false, sensitiveReason: "Skipped - verification disabled"
    };
  }

  // Fetch and prepare image
  let base64Image, mimeType;
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    base64Image = buffer.toString("base64");
    mimeType = response.headers.get("content-type") || "image/jpeg";
    console.log("[NEXT_BACKEND] [Gemini] Image fetched successfully, size:", buffer.length, "bytes");
  } catch (fetchError) {
    console.error("[NEXT_BACKEND] [Gemini] Error fetching image:", fetchError.message);
    return {
      isFire: false, score: 0.0,
      reason: `Failed to fetch image for verification: ${fetchError.message}`,
      action: "ignore",
      sensitive: false, sensitiveReason: "Could not analyze - image fetch failed"
    };
  }

  // TESTED WORKING MODELS (January 17, 2026)
  // Priority order: fastest and most reliable first
  const WORKING_MODELS = [
    "gemini-3-flash-preview",     // Working - Latest fastest model
    "gemini-2.5-flash",           // Working - Stable fast model
    "gemini-3-pro-preview",       // Rate limited but exists - High quality
    "gemini-2.5-pro",             // Rate limited but exists - High quality
    "gemini-2.0-flash",           // Rate limited but exists
    "gemini-2.0-flash-exp",       // Rate limited but exists
    "gemini-2.0-flash-lite",      // Rate limited but exists - Lightweight
    "gemini-3-pro-image-preview", // Rate limited but exists - Image focused
    "gemini-exp-1206",            // Rate limited but exists - Experimental
  ];

  const prompt = `You are an AI fire-safety verification system for AgniShakti, a smart fire detection platform deployed in buildings.

CONTEXT:
- An AI camera model (YOLO) detected possible fire or smoke in a surveillance image.
- You must decide whether this is a REAL EMERGENCY that requires fire station escalation.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 ESCALATE — trigger_alert — for:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Burning fabric, curtains, clothes, paper, books, cardboard, furniture, trash
- Any fire that is spreading or out of control
- Structural fires (wall, ceiling, floor, wire/electrical)
- Thick smoke billowing from an unidentified source
- Smoke filling a room with no obvious safe cause

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ IGNORE — ignore — for:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Candles (even lit, unless visibly catching other objects on fire)
- Cigarette lighters or matches in normal use
- Gas stoves, cooking flames, or kitchen activity
- Fireplaces (indoor, clearly contained)
- Incense sticks, diyas, small decorative flames
- Cigarette/vape smoke, steam, fog machines

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚫 ALWAYS IGNORE — ignore — fake/screen/light sources:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Bright lights, light bulbs, tube lights, or lamps
- Sunlight glare, lens flare, or reflections on windows/surfaces
- Glowing heaters or bright spots that are clearly NOT flames
- Fire or smoke shown on a phone screen, TV, laptop, or monitor
- Video footage of fire being played on a device in the scene
- Printed images or posters showing fire
- Any fire that is clearly 2D, pixelated, or behind glass/screen
(These are deliberate attempts or common AI mistakes — reject firmly.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSTRUCTIONS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Examine the image carefully.
2. Identify what is burning or producing smoke.
3. Determine if it meets ESCALATE or IGNORE criteria.
4. Write a short, clear reason (1–2 sentences max) that describes exactly what you see and why you made the decision. This will be displayed to the building owner in real time.

Respond ONLY in valid JSON:

{
  "fire_detected": true or false,
  "confidence": "low | medium | high",
  "fire_type": "e.g. curtain fire | candle | cooking | screen/fake | structural | smoke only",
  "reason": "Short 1-2 sentence human-readable explanation shown to the owner.",
  "action": "trigger_alert | ignore"
}

Do not include any text outside the JSON.`;

  // Build request body
  const requestBody = {
    contents: [{
      parts: [
        { text: prompt },
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Image
          }
        }
      ]
    }]
  };

  console.log("[NEXT_BACKEND] [Gemini] Starting model+key fallback loop...");
  console.log("[NEXT_BACKEND] [Gemini] Models to try:", WORKING_MODELS.length);
  console.log("[NEXT_BACKEND] [Gemini] API keys to try:", apiKeys.length);

  let lastError = null;

  // Try each API key
  for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex++) {
    const apiKey = apiKeys[keyIndex];
    console.log(`[NEXT_BACKEND] [Gemini] Using API key ${keyIndex + 1}/${apiKeys.length}: ${apiKey.substring(0, 10)}...`);

    // Try each model with this API key
    for (const modelName of WORKING_MODELS) {
      try {
        console.log(`[NEXT_BACKEND] [Gemini] Trying model: ${modelName}...`);

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (response.status === 429) {
          console.warn(`[NEXT_BACKEND] [Gemini] ⚠️ Model ${modelName} rate limited (429)`);
          lastError = new Error(`Rate limited: ${modelName}`);
          continue; // Try next model
        }

        if (response.status === 404) {
          console.warn(`[NEXT_BACKEND] [Gemini] ❌ Model ${modelName} not found (404)`);
          lastError = new Error(`Not found: ${modelName}`);
          continue; // Try next model
        }

        if (!response.ok) {
          console.warn(`[NEXT_BACKEND] [Gemini] ❌ Model ${modelName} error: ${response.status}`);
          lastError = new Error(`Error ${response.status}: ${JSON.stringify(data)}`);
          continue; // Try next model
        }

        // Success! Extract the response
        console.log(`[NEXT_BACKEND] [Gemini] ✅ Success with model: ${modelName}`);

        let text = "";
        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
          text = data.candidates[0].content.parts[0].text || "";
        }

        if (!text) {
          console.warn(`[NEXT_BACKEND] [Gemini] ⚠️ Empty response from ${modelName}`);
          lastError = new Error(`Empty response from ${modelName}`);
          continue;
        }

        console.log("[NEXT_BACKEND] [Gemini] Raw response:", text.substring(0, 200));

        // Parse JSON response
        let analysis;
        try {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error("No valid JSON found in response");
          analysis = JSON.parse(jsonMatch[0]);
        } catch (parseError) {
          console.error("[NEXT_BACKEND] [Gemini] ❌ Failed to parse JSON:", parseError.message);
          const isFireMatch = text.toLowerCase().includes('"fire_detected": true') ||
            text.toLowerCase().includes('"fire_detected":true');
          return {
            isFire: isFireMatch, score: isFireMatch ? 0.7 : 0.3,
            reason: text.substring(0, 500),
            action: isFireMatch ? "trigger_alert" : "ignore",
            sensitive: false, sensitiveReason: "Could not parse sensitivity check"
          };
        }

        // Convert response to internal format
        const isFire = analysis.fire_detected === true || analysis.isFire === true;

        // Convert confidence from string to number
        let confidenceScore;
        if (typeof analysis.confidence === "string") {
          const confStr = analysis.confidence.toLowerCase();
          if (confStr === "high") confidenceScore = 0.9;
          else if (confStr === "medium") confidenceScore = 0.6;
          else if (confStr === "low") confidenceScore = 0.3;
          else confidenceScore = isFire ? 0.7 : 0.3;
        } else if (typeof analysis.confidence === "number") {
          confidenceScore = analysis.confidence;
        } else {
          confidenceScore = isFire ? 0.85 : 0.15;
        }

        console.log("[NEXT_BACKEND] [Gemini] ✅ Verification complete:", {
          isFire,
          score: confidenceScore,
          reason: analysis.reason?.substring(0, 100),
          action: analysis.action
        });

        return {
          isFire,
          score: confidenceScore,
          reason: analysis.reason || analysis.reasoning || "Fire detection completed",
          action: analysis.action || (isFire ? "trigger_alert" : "ignore"),
          fireIndicators: analysis.fireIndicators || [],
          falsePositiveReasons: analysis.falsePositiveReasons || [],
          sensitive: analysis.sensitive === true,
          sensitiveReason: analysis.sensitiveReason || "No sensitive content detected"
        };

      } catch (modelError) {
        console.error(`[NEXT_BACKEND] [Gemini] ❌ Model ${modelName} threw error:`, modelError.message);
        lastError = modelError;
        continue; // Try next model
      }
    }

    // If we get here, all models failed with this API key
    console.warn(`[NEXT_BACKEND] [Gemini] ⚠️ All models failed with API key ${keyIndex + 1}. Trying next key...`);
  }

  // All API keys and models failed
  console.error("[NEXT_BACKEND] [Gemini] ❌ ALL API keys and models failed!");
  return {
    isFire: false, // Safe default
    score: 0.0,
    reason: `Gemini verification failed: ${lastError?.message || "All models failed"}`,
    action: "ignore",
    sensitive: false,
    sensitiveReason: "Could not verify - all attempts failed"
  };
}

/**
 * getActiveAlertsForOwner
 */
export async function getActiveAlertsForOwner(ownerEmail) {
  const safeEmail = normalizeEmail(ownerEmail);
  const houses = await getHousesByOwnerEmail(safeEmail);
  const houseIds = houses.map((h) => h.houseId);
  if (houseIds.length === 0) return [];

  const chunkSize = 10;
  const results = [];
  for (let i = 0; i < houseIds.length; i += chunkSize) {
    const chunk = houseIds.slice(i, i + chunkSize);
    const snap = await db.collection("alerts").where("houseId", "in", chunk).where("status", "in", ["PENDING", "CONFIRMED_BY_GEMINI", "SENDING_NOTIFICATIONS", "NOTIFIED_COOLDOWN"]).get();
    snap.forEach((d) => results.push(d.data()));
  }
  return results;
}

/**
 * getAlertsByOwnerEmail
 * Optimized to only fetch active alerts and recently resolved ones (last 2 minutes)
 * to prevent Firestore quota exhaustion
 */
export async function getAlertsByOwnerEmail(ownerEmail) {
  const safeEmail = normalizeEmail(ownerEmail);

  // First get all houses for this owner
  const housesSnapshot = await db.collection("houses").where("ownerEmail", "==", safeEmail).get();
  const houseIds = housesSnapshot.docs.map(doc => doc.id);

  if (houseIds.length === 0) return [];

  const alerts = [];
  const chunkSize = 10;

  // Get active alerts and recently created rejected/cancelled alerts
  // This reduces the number of Firestore queries significantly
  for (let i = 0; i < houseIds.length; i += chunkSize) {
    const chunk = houseIds.slice(i, i + chunkSize);
    try {
      // Fetch active alerts
      const activeSnap = await db.collection("alerts")
        .where("houseId", "in", chunk)
        .where("status", "in", ["PENDING", "CONFIRMED_BY_GEMINI", "SENDING_NOTIFICATIONS", "NOTIFIED_COOLDOWN"])
        .get();
      activeSnap.forEach(doc => {
        alerts.push({ id: doc.id, ...doc.data() });
      });

      // Get recently created rejected/cancelled alerts (created in last 10 minutes)
      // This includes alerts that were just rejected by Gemini or cancelled by user
      // We use a longer window (10 min) to catch alerts that might have been created earlier
      // but just got their status updated
      try {
        const tenMinutesAgo = admin.firestore.Timestamp.fromMillis(Date.now() - 10 * 60 * 1000);
        const recentSnap = await db.collection("alerts")
          .where("houseId", "in", chunk)
          .where("status", "in", ["REJECTED_BY_GEMINI", "CANCELLED_BY_USER"])
          .where("createdAt", ">=", tenMinutesAgo)
          .get();

        recentSnap.forEach(doc => {
          const alertData = doc.data();
          // Only include if not already in alerts array
          if (!alerts.find(a => a.id === doc.id)) {
            alerts.push({ id: doc.id, ...alertData });
          }
        });
      } catch (recentErr) {
        // If the recent query fails (e.g., index not created), fall back to fetching all rejected/cancelled
        // This is a safety net - in production you should create the required Firestore index
        if (recentErr.code === 9 || recentErr.message.includes("index")) {
          console.warn("[NEXT_BACKEND] Index required for recent alerts query. Fetching all rejected/cancelled alerts for this chunk as fallback.");
          const allRejectedSnap = await db.collection("alerts")
            .where("houseId", "in", chunk)
            .where("status", "in", ["REJECTED_BY_GEMINI", "CANCELLED_BY_USER"])
            .get();

          allRejectedSnap.forEach(doc => {
            const alertData = doc.data();
            if (!alerts.find(a => a.id === doc.id)) {
              alerts.push({ id: doc.id, ...alertData });
            }
          });
        } else {
          throw recentErr; // Re-throw if it's not an index error
        }
      }
    } catch (err) {
      console.error("[NEXT_BACKEND] Error fetching alerts for chunk:", err.message);
      // Continue with other chunks even if one fails
      // If quota exceeded, at least return what we have
      if (err.code === 8 || err.message.includes("Quota exceeded")) {
        console.warn("[NEXT_BACKEND] Quota exceeded, returning partial results");
        break; // Stop querying more chunks
      }
    }
  }

  return alerts;
}

// =================================================================
// --- RESPONDER TRACKING & DISPATCH (EXACT IMPLEMENTATION) ---
// =================================================================

/**
 * updateResponderHeartbeat
 * - Updates responder's live location and lastSeen timestamp
 * - Only runs if status is ONLINE (or explicitly passed)
 */
export async function updateResponderHeartbeat({ responderId, responderEmail, location, status }) {
  if (!responderId && !responderEmail) throw new Error("Responder identifier missing");

  // Use email as doc ID if available (normalized), else responderId
  let ref;
  if (responderEmail) {
    ref = db.collection("users").doc(normalizeEmail(responderEmail));
  } else {
    ref = db.collection("users").doc(responderId);
  }

  const updatePayload = {
    lastSeen: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  if (location) {
    updatePayload.currentLocation = {
      lat: location.latitude,
      lng: location.longitude,
      accuracy: location.accuracy || 0,
      timestamp: location.timestamp || new Date().toISOString()
    };
  }

  if (status) {
    updatePayload.status = status;
  }

  // Use set with merge=true to handle case where doc might be missing fields
  await ref.set(updatePayload, { merge: true });
  console.log(`[BACKEND] [Heartbeat] Updated ${responderEmail || responderId} - Status: ${status || 'KEEP'}, Loc: ${location ? 'YES' : 'NO'}`);
  return { success: true };
}

/**
 * findNearestOnlineResponders
 * - Finds ONLINE responders within service radius
 * - Sorts by distance
 * - Returns top N
 */
export async function findNearestOnlineResponders(fireLat, fireLng, radiusKm = 50, limit = 5) {
  console.log(`[BACKEND] [Dispatch] Finding nearest responders to [${fireLat}, ${fireLng}] radius=${radiusKm}km...`);

  // 1. Query ONLINE responders
  const respondersSnap = await db.collection("users")
    .where("role", "==", "provider")
    .where("status", "==", "ONLINE")
    .get();

  if (respondersSnap.empty) {
    console.log(`[BACKEND] [Dispatch] No ONLINE responders found.`);
    return [];
  }

  const candidates = [];
  const now = Date.now();
  const MAX_SILENCE_MS = 5 * 60 * 1000; // 5 minutes

  respondersSnap.forEach(doc => {
    const data = doc.data();

    // Check liveness (lastSeen < 5 mins)
    if (!data.lastSeen) return;
    const lastSeenTime = data.lastSeen.toDate ? data.lastSeen.toDate().getTime() : new Date(data.lastSeen).getTime();
    if (now - lastSeenTime > MAX_SILENCE_MS) {
      // Stale - skip
      return;
    }

    // Check location existence
    if (!data.currentLocation || !data.currentLocation.lat || !data.currentLocation.lng) return;

    // Calculate distance
    const dist = haversineKm(fireLat, fireLng, data.currentLocation.lat, data.currentLocation.lng);

    if (dist <= radiusKm) {
      candidates.push({
        ...data,
        email: doc.id, // Normalized email is the ID
        distKm: dist
      });
    }
  });

  // Sort by distance ASC
  candidates.sort((a, b) => a.distKm - b.distKm);

  // Take top N
  const selected = candidates.slice(0, limit);

  console.log(`[BACKEND] [Dispatch] Found ${candidates.length} candidates. Selected top ${selected.length}.`);
  selected.forEach((c, i) => console.log(`   #${i + 1}: ${c.name} (${c.distKm.toFixed(2)}km)`));

  return selected;
}

/**
 * resetCooldownForUser
 * - Clears all active cooldown/blocked alerts for a user's cameras.
 * - Called on user login to ensure clean slate for demos.
 */
export async function resetCooldownForUser(ownerEmail) {
  console.log(`[BACKEND] [Demo Reset] Clearing cooldown for user: ${ownerEmail}`);

  const safeEmail = normalizeEmail(ownerEmail);

  // 1. Get all houses for this owner
  const housesSnap = await db.collection("houses").where("ownerEmail", "==", safeEmail).get();
  if (housesSnap.empty) {
    console.log(`[BACKEND] [Demo Reset] No houses found for ${safeEmail}`);
    return { success: true, deletedCount: 0 };
  }

  const houseIds = housesSnap.docs.map(d => d.id);
  console.log(`[BACKEND] [Demo Reset] Found ${houseIds.length} houses`);

  // 2. Get all cameras for these houses
  let cameraIds = [];
  for (let i = 0; i < houseIds.length; i += 10) {
    const chunk = houseIds.slice(i, i + 10);
    const camerasSnap = await db.collection("cameras").where("houseId", "in", chunk).get();
    camerasSnap.forEach(doc => cameraIds.push(doc.id));
  }

  if (cameraIds.length === 0) {
    console.log(`[BACKEND] [Demo Reset] No cameras found for user`);
    return { success: true, deletedCount: 0 };
  }

  console.log(`[BACKEND] [Demo Reset] Found ${cameraIds.length} cameras`);

  // 3. Delete ALL active alerts for these cameras (regardless of status)
  let deletedCount = 0;
  for (let i = 0; i < cameraIds.length; i += 10) {
    const chunk = cameraIds.slice(i, i + 10);
    const alertsSnap = await db.collection("alerts").where("cameraId", "in", chunk).get();

    for (const doc of alertsSnap.docs) {
      try {
        await doc.ref.delete();
        deletedCount++;
        console.log(`[BACKEND] [Demo Reset] Deleted alert ${doc.id}`);
      } catch (err) {
        console.error(`[BACKEND] [Demo Reset] Failed to delete alert ${doc.id}:`, err);
      }
    }
  }

  console.log(`[BACKEND] [Demo Reset] ✅ Cleared ${deletedCount} alerts for ${safeEmail}`);
  return { success: true, deletedCount };
}