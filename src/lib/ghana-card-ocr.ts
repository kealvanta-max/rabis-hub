import Tesseract from "tesseract.js";

export interface OcrResult {
  valid: boolean;
  confidence: number;
  message: string;
}

export const GHANA_CARD_SAMPLES = [
  "https://drive.google.com/file/d/1p02pxHMhEoLyDZ8FI27CmUUKEm-NZezZ/view?usp=drivesdk",
  "https://drive.google.com/file/d/1l0bIilZrdaeTZqe0n-3iZ4Z2UPMubHlL/view?usp=drivesdk",
  "https://drive.google.com/file/d/1CANZrqIcPkO6FtJOdyuaP0HVZnt_lZyn/view?usp=drivesdk",
  "https://drive.google.com/file/d/1pIKW4N3yl3xswYlZwoHAfRheqI6WiSwW/view?usp=drivesdk"
];

export async function verifyGhanaCardWithOCR(
  imageUrl: string,
  declaredCardNumber: string
): Promise<OcrResult> {
  try {
    const result = await Tesseract.recognize(imageUrl, "eng");
    const extractedText = result.data.text.toUpperCase();
    const ghanaCardMarkers = ["GHANA CARD", "REPUBLIC OF GHANA", "NATIONAL IDENTIFICATION AUTHORITY", "NIA", "GHA-"];
    const cardNumberPattern = declaredCardNumber.toUpperCase();
    const cardNumberFound = extractedText.includes(cardNumberPattern);
    const markersFound = ghanaCardMarkers.some((marker) => extractedText.includes(marker));

    if (cardNumberFound && markersFound) {
      return { valid: true, confidence: 95, message: "Ghana Card verified with high confidence." };
    } else if (cardNumberFound) {
      return { valid: true, confidence: 60, message: "Card number detected, but visual markers are unclear. Admin will verify manually." };
    } else if (markersFound) {
       return { valid: false, confidence: 30, message: "Ghana Card markers detected, but the card number does not match your input. Please re-upload." };
    } else {
      return { valid: false, confidence: 0, message: "The card image does not appear to be a valid Ghana Card. Please upload a clear image." };
    }
  } catch (error) {
    console.error("OCR verification failed:", error);
    return { valid: false, confidence: 0, message: "OCR verification failed. Please ensure the image is clear and try again." };
  }
}

export const ghanaCardReferenceData = {
  front: {
    title: "Front Side",
    description: "Contains the following elements:",
    elements: ["Header: 'REPUBLIC OF GHANA'", "Issuing Authority: 'NATIONAL IDENTIFICATION AUTHORITY'", "Holder's Name", "Date of Birth", "Ghana Card Number (Format: GHA-XXXXXXXXX-X)", "Holder's Photograph", "Security Features: Hologram, microprint"],
    samples: GHANA_CARD_SAMPLES.slice(0, 2)
  },
  back: {
    title: "Back Side",
    description: "Contains the following elements:",
    elements: ["NIA Logo", "Barcode / QR Code Zone", "Additional Personal Data Fields", "Emergency Contact Information", "Signature Area", "Security Features: Hologram, microprint"],
    samples: GHANA_CARD_SAMPLES.slice(2)
  },
};
