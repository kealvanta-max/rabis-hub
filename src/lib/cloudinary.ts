interface CloudinaryResponse {
    secure_url: string;
    error?: {
        message: string;
    };
}

export const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
export const UPLOAD_PRESET = "rabi-user-docs";

export async function uploadToCloudinary(file: File): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", UPLOAD_PRESET);

    try {
        const res = await fetch(
            `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
            {
                method: "POST",
                body: formData,
            }
        );
        
        const data: CloudinaryResponse = await res.json();
        
        if (!res.ok) {
            throw new Error(data.error?.message || "Upload failed");
        }
        
        return data.secure_url;
    } catch (error) {
        console.error("Cloudinary upload error:", error);
        throw new Error(error instanceof Error ? error.message : "Image upload failed");
    }
}
