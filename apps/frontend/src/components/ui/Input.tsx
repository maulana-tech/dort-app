import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

const FIELD =
  "h-9 border border-border px-3 text-[13px] text-fg outline-none transition-colors placeholder:text-dim hover:border-border-strong focus:border-primary/60";

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`${FIELD} rounded-inner bg-field ${className}`}
      {...props}
    />
  );
}

export function Textarea({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`${FIELD} h-auto resize-y rounded-inner bg-field py-2 ${className}`}
      {...props}
    />
  );
}
