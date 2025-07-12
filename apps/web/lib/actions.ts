"use server";

import { getHelloMessage } from "@/lib/api-client";

export async function fetchHelloMessage(name: string) {
  return await getHelloMessage(name);
}