// Type-check stub for the consumer's `@/components/ui/button` (shadcn). Not part
// of the registry output, installed as a registryDependency in the user's project.
import * as React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "default"
    | "ghost"
    | "outline"
    | "secondary"
    | "destructive"
    | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

export function Button(props: ButtonProps) {
  return <button {...props} />;
}
