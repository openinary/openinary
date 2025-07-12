import { hc } from "hono/client";
import { AppType } from "api";

export const apiClient = hc<AppType>(process.env.API_URL!);

export async function getHelloMessage(name: string) {
  try {
    const response = await apiClient.hello[":name"].$get({
      param: { name }
    });
    const data = await response.json();
    return { success: true, message: data.message };
  } catch (error) {
    console.error('API Error:', error);
    return { success: false, message: "Error calling API" };
  }
}