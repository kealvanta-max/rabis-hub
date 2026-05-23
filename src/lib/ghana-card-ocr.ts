import Tesseract from "tesseract.js";

export interface OcrResult {
  valid: boolean;
  confidence: number;
  message: string;
}

/**
 * Verify Ghana Card using OCR on the uploaded image
 * @param imageUrl - URL of the Ghana Card image
 * @param declaredCardNumber - The Ghana Card number declared by the user (format: GHA-XXXXXXXXX-X)
 * @returns OcrResult with validity, confidence, and message
 */
export async function verifyGhanaCardWithOCR(
  imageUrl: string,
  declaredCardNumber: string
): Promise<OcrResult> {
  try {
    // Run OCR on the image
    const result = await Tesseract.recognize(imageUrl, "eng");
    const extractedText = result.data.text.toUpperCase();

    // Ghana Card visual markers
    const ghanaCardMarkers = [
      "GHANA CARD",
      "REPUBLIC OF GHANA",
      "NATIONAL IDENTIFICATION AUTHORITY",
      "NIA",
    ];

    // Check if the declared card number is in the extracted text
    const cardNumberPattern = declaredCardNumber.toUpperCase();
    const cardNumberFound = extractedText.includes(cardNumberPattern);

    // Check for Ghana Card markers
    const markersFound = ghanaCardMarkers.some((marker) =>
      extractedText.includes(marker)
    );

    if (cardNumberFound && markersFound) {
      // Both card number and markers found - high confidence
      return {
        valid: true,
        confidence: 95,
        message: "Ghana Card verified with high confidence.",
      };
    } else if (cardNumberFound) {
      // Only card number found - medium confidence
      return {
        valid: true,
        confidence: 60,
        message:
          "Card format matches, but visual verification is pending admin review.",
      };
    } else {
      // Neither found - invalid
      return {
        valid: false,
        confidence: 0,
        message:
          "The card image does not appear to be a valid Ghana Card. Please upload a clear image.",
      };
    }
  } catch (error) {
    // If OCR fails, return a graceful error
    console.error("OCR verification failed:", error);
    return {
      valid: false,
      confidence: 0,
      message:
        "OCR verification unavailable. Admin will verify manually.",
    };
  }
}

/**
 * Sample Ghana Card reference data for admin display
 */
export const ghanaCardReferenceData = {
  front: {
    title: "Front Side",
    description: "Contains the following elements:",
    elements: [
      "Header: 'REPUBLIC OF GHANA'",
      "Issuing Authority: 'NATIONAL IDENTIFICATION AUTHORITY'",
      "Holder's Name",
      "Date of Birth",
      "Ghana Card Number (Format: GHA-XXXXXXXXX-X)",
      "Holder's Photograph",
      "Security Features: Hologram, microprint",
    ],
  },
  back: {
    title: "Back Side",
    description: "Contains the following elements:",
    elements: [
      "NIA Logo",
      "Barcode / QR Code Zone",
      "Additional Personal Data Fields",
      "Emergency Contact Information",
      "Signature Area",
      "Security Features: Hologram, microprint",
    ],
  },
};
