import { hc } from "hono/client";
import { AppType } from "api";

export const apiClient = hc<AppType>(process.env.API_URL!);

export async function getHelloMessage(name: string) {
  try {
    const response = await apiClient.hello[":name"].$get({
      param: { name },
    });
    const data = await response.json();
    return { success: true, message: data.message };
  } catch (error) {
    console.error("API Error:", error);
    return { success: false, message: "Error calling API" };
  }
}

export async function getMediaFiles() {
  try {
    const response = await apiClient.files.$get();
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error("API Error:", error);
    return { success: false, data: null };
  }
}

export async function uploadFile(file: File) {
  try {
    const formData = new FormData();
    formData.append("file", file);

    const response = await apiClient.upload.$post({
      form: { file },
    });
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error("Upload Error:", error);
    return { success: false, error: "Upload failed" };
  }
}

export async function getFolderFiles(folderKey: string) {
  try {
    const response = await apiClient.files.folder[":key"].$get({
      param: { key: folderKey },
    });
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error("API Error:", error);
    return { success: false, data: null };
  }
}

export async function deleteFile(key: string) {
  try {
    const response = await apiClient.files[":key"].$delete({
      param: { key },
    });
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error("Delete Error:", error);
    return { success: false, error: "Delete failed" };
  }
}
