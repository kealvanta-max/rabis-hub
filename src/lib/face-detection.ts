import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";

export interface FaceDetectionResult {
  isHuman: boolean;
  confidence: number;
  message: string;
}

let faceDetector: FaceDetector | null = null;

/**
 * Initialize the MediaPipe FaceDetector
 */
async function initializeFaceDetector(): Promise<FaceDetector> {
  if (faceDetector) {
    return faceDetector;
  }

  try {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );

    faceDetector = await FaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
      },
      runningMode: "IMAGE",
    });

    return faceDetector;
  } catch (error) {
    console.error("Failed to initialize FaceDetector:", error);
    throw error;
  }
}

/**
 * Detect human face in an image
 * @param imageUrl - URL of the image to analyze
 * @returns FaceDetectionResult with face detection status
 */
export async function detectHumanFace(imageUrl: string): Promise<FaceDetectionResult> {
  try {
    const detector = await initializeFaceDetector();

    // Load image from URL
    const img = new Image();
    img.crossOrigin = "anonymous";

    return new Promise((resolve) => {
      img.onload = async () => {
        try {
          // Detect faces in the image
          const detectionResult = detector.detectForVideo(
            img,
            performance.now()
          );

          const detections = detectionResult.detections || [];

          if (detections.length > 0) {
            // Check if any detection has confidence above 0.7
            const highConfidenceDetection = detections.find(
              (d) => (d.categories?.[0]?.score || 0) > 0.7
            );

            if (highConfidenceDetection) {
              const confidence = Math.round(
                (highConfidenceDetection.categories?.[0]?.score || 0) * 100
              );
              resolve({
                isHuman: true,
                confidence,
                message: "Human face detected successfully.",
              });
            } else {
              resolve({
                isHuman: false,
                confidence: 0,
                message:
                  "No human face detected. Please upload a clear photo of your face.",
              });
            }
          } else {
            resolve({
              isHuman: false,
              confidence: 0,
              message:
                "No human face detected. Please upload a clear photo of your face.",
            });
          }
        } catch (error) {
          console.error("Face detection error:", error);
          resolve({
            isHuman: true,
            confidence: 0,
            message: "Face detection unavailable — admin will verify manually.",
          });
        }
      };

      img.onerror = () => {
        console.error("Failed to load image for face detection");
        resolve({
          isHuman: true,
          confidence: 0,
          message: "Face detection unavailable — admin will verify manually.",
        });
      };

      img.src = imageUrl;
    });
  } catch (error) {
    console.error("Face detection initialization failed:", error);
    return {
      isHuman: true,
      confidence: 0,
      message: "Face detection unavailable — admin will verify manually.",
    };
  }
}
