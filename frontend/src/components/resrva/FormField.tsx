import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";

export function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-gray-700">
      {children}
    </label>
  );
}

export const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-400 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10";

export const textareaClass =
  "min-h-24 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-400 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10";

export const selectClass =
  "h-11 w-full appearance-none rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-400 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

export type SelectOption = {
  value: string;
  label: ReactNode;
  disabled?: boolean;
};

export function SelectInput({
  id,
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
  className = "",
  buttonClassName = "",
  menuClassName = "",
}: {
  id?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
}) {
  const generatedId = useId();
  const controlId = id || generatedId;
  const listboxId = `${controlId}-listbox`;
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [menuPosition, setMenuPosition] = useState<{
    left: number;
    top?: number;
    bottom?: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!wrapperRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setMenuPosition(null);
      return undefined;
    }

    const updateMenuPosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;

      const gap = 8;
      const viewportPadding = 12;
      const belowSpace = window.innerHeight - rect.bottom - viewportPadding;
      const aboveSpace = rect.top - viewportPadding;
      const openAbove = belowSpace < 180 && aboveSpace > belowSpace;
      const maxHeight = Math.max(120, Math.min(256, openAbove ? aboveSpace - gap : belowSpace - gap));

      setMenuPosition({
        left: Math.min(rect.left, window.innerWidth - rect.width - viewportPadding),
        width: rect.width,
        maxHeight,
        ...(openAbove
          ? { bottom: window.innerHeight - rect.top + gap }
          : { top: rect.bottom + gap }),
      });
    };

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [isOpen]);

  const focusNext = (direction: 1 | -1) => {
    const enabledIndexes = options
      .map((option, index) => (option.disabled ? -1 : index))
      .filter((index) => index >= 0);

    if (enabledIndexes.length === 0) return;

    const currentPosition = enabledIndexes.indexOf(focusedIndex);
    const nextPosition =
      currentPosition === -1
        ? direction === 1
          ? 0
          : enabledIndexes.length - 1
        : (currentPosition + direction + enabledIndexes.length) % enabledIndexes.length;

    setFocusedIndex(enabledIndexes[nextPosition]);
  };

  const chooseOption = (option: SelectOption) => {
    if (option.disabled) return;

    onChange(option.value);
    setIsOpen(false);
    setFocusedIndex(-1);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setFocusedIndex(selectedIndex >= 0 ? selectedIndex : -1);
      }
      focusNext(event.key === "ArrowDown" ? 1 : -1);
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setFocusedIndex(selectedIndex >= 0 ? selectedIndex : -1);
        return;
      }

      const focusedOption = options[focusedIndex];
      if (focusedOption) chooseOption(focusedOption);
    }

    if (event.key === "Escape") {
      setIsOpen(false);
      setFocusedIndex(-1);
    }
  };

  return (
    <div ref={wrapperRef} className={`relative w-full ${className}`}>
      <button
        ref={buttonRef}
        id={controlId}
        type="button"
        disabled={disabled}
        className={`${selectClass} flex items-center justify-between gap-3 text-left disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400 ${buttonClassName}`}
        role="combobox"
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        onClick={() => {
          if (!disabled) {
            setIsOpen((current) => !current);
            setFocusedIndex(selectedIndex >= 0 ? selectedIndex : -1);
          }
        }}
        onKeyDown={handleKeyDown}
      >
        <span className={`min-w-0 truncate ${selectedOption ? "" : "text-gray-400 dark:text-gray-500"}`}>
          {selectedOption?.label || "Select"}
        </span>
        <ChevronDown className={`size-4 shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && menuPosition
        ? createPortal(
        <div
          ref={menuRef}
          id={listboxId}
          role="listbox"
          style={menuPosition}
          className={`fixed z-[2147483647] overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark ${menuClassName}`}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isFocused = index === focusedIndex;

            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={option.disabled}
                onMouseEnter={() => setFocusedIndex(index)}
                onClick={() => chooseOption(option)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                  isSelected
                    ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                    : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.04]"
                } ${isFocused && !isSelected ? "bg-gray-50 dark:bg-white/[0.04]" : ""} ${
                  option.disabled ? "cursor-not-allowed opacity-50" : ""
                }`}
              >
                <span className="min-w-0 truncate">{option.label}</span>
                {isSelected ? <Check className="size-4 shrink-0" /> : null}
              </button>
            );
          })}
        </div>,
          document.body,
        )
        : null}
    </div>
  );
}

export function FormMessage({
  type,
  children,
}: {
  type: "error" | "success" | "info";
  children: ReactNode;
}) {
  const styles = {
    error: "border-error-200 bg-error-50 text-error-700",
    success: "border-success-200 bg-success-50 text-success-700",
    info: "border-blue-light-200 bg-blue-light-50 text-blue-light-700",
  };

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${styles[type]}`}>
      {children}
    </div>
  );
}
