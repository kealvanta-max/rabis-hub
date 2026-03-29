interface CloudinaryResponse {
    secure_url: string;
}

export const CLOUD_NAME = "dsbvsyhgw";
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
        return data.secure_url;
    } catch (error) {
        console.error("Cloudinary upload error:", error);
        throw new Error("Image upload failed");
    }
}
