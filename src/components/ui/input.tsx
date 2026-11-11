"use client";

import { InputHTMLAttributes, forwardRef, useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", id, type, ...props }, ref) => {
    /*
     * `useId` rather than a slug of the label.
     *
     * The slug collides: two fields on the signup flow can share a label, and a
     * duplicate id means the label points at whichever input came first, so
     * tapping "Password" focuses the field above it. An unlabelled input also
     * got an empty id. `useId` is unique by construction and stable between the
     * server render and the client.
     */
    const generatedId = useId();
    const inputId = id || generatedId;
    const errorId = `${inputId}-error`;
    const [showPassword, setShowPassword] = useState(false);
    
    const isPassword = type === "password";
    const currentType = isPassword ? (showPassword ? "text" : "password") : type;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-gray-300 mb-1.5"
          >
            {label}
          </label>
        )}
        <div className="relative">
            <input
            ref={ref}
            id={inputId}
            type={currentType}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={`w-full px-4 py-3 bg-[#051A10]/60 border border-[#065F46] rounded-xl text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-200 ${
                error ? "border-red-500 focus:ring-red-500/50" : ""
            } ${className} ${isPassword ? "pr-12" : ""}`}
            {...props}
            />
            {isPassword && (
                /*
                 * Reachable by keyboard, and it says what it does.
                 *
                 * The toggle was `tabIndex={-1}` with no name, so a keyboard or
                 * switch user could not reveal the password they were typing,
                 * and a screen reader announced only "button".
                 */
                <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-xl text-gray-400 transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                {showPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
                </button>
            )}
        </div>
        {error && (
          /*
           * Announced when it appears and attached to the field it belongs to,
           * so the reader repeats the reason on returning to the input instead
           * of reading it once at the top of the form.
           */
          <p id={errorId} role="alert" className="mt-1 text-xs text-red-400">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
export default Input;
