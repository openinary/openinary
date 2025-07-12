"use client"

import { useState } from "react";
import { fetchHelloMessage } from "@/lib/actions";

import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
} from "@repo/ui/components/ui/card"


export default function Page() {
  const [message, setMessage] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    setIsLoading(true);
    try {
      const result = await fetchHelloMessage('web');
      setMessage(result.message);
    } catch (error) {
      setMessage("Error calling API");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex justify-center items-center h-screen">
      <Card  className="max-w-xl">
        <CardContent>
          <Button onClick={handleClick} disabled={isLoading}>
            {isLoading ? "Loading..." : "Call API"}
          </Button>
        </CardContent>
        <CardFooter>
         <p>Message: {message && <b>{message}</b>}</p>
        </CardFooter>
      </Card>
    </main>
  );
}
