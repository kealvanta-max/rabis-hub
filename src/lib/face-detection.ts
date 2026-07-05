import * as faceapi from 'face-api.js';

export interface FaceDetectionResult {
  isHuman: boolean;
  confidence: number;
  message: string;
}

let modelsLoaded = false;

async function loadModels() {
  if (modelsLoaded) return;
  const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js/weights';
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
  modelsLoaded = true;
}

export async function detectHumanFace(imageUrl: string): Promise<FaceDetectionResult> {
  try {
    await loadModels();
    const img = await faceapi.fetchImage(imageUrl);
    const detections = await faceapi.detectAllFaces(img, new faceapi.TinyFaceDetectorOptions());
    
    if (detections.length > 0) {
      return { isHuman: true, confidence: detections[0].score * 100, message: "Human face detected." };
    } else {
      return { isHuman: false, confidence: 0, message: "No human face detected. Please upload a clear photo of yourself." };
    }
  } catch (error) {
    console.error("Face detection failed:", error);
    return { isHuman: false, confidence: 0, message: "Security verification failed. Please try a different photo." };
  }
}
