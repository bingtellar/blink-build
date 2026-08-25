import React from "react";
import { X, ArrowLeft } from "lucide-react";

interface LayoutProps {
  children: React.ReactNode;
  hideClose?: boolean;
  onBack?: () => void;
}

export const AuthLayout = ({
  children,
  hideClose = false,
  onBack,
}: LayoutProps) => (
  <div className="min-h-screen bg-[#F9F9F8] flex flex-col items-center justify-start md:justify-center p-4 font-sans text-gray-900">
    <div className="w-full md:absolute top-0 p-6 md:p-8 flex justify-between items-center max-w-7xl mx-auto mb-4 md:mb-0">
      <span className="text-2xl md:text-3xl font-bold tracking-tighter">
        Blink
      </span>
      {!hideClose && (
        <button className="p-2 bg-[#F1F1F0] rounded-full hover:bg-gray-200 transition-all text-gray-600">
          <X size={20} />
        </button>
      )}
    </div>
    <div className="w-full max-w-[480px] bg-white rounded-2xl border border-gray-100 p-6 md:p-10 shadow-sm animate-in zoom-in-95 duration-300">
      {onBack && (
        <button
          onClick={onBack}
          className="mb-6 flex items-center gap-2 text-sm font-semibold text-gray-400 hover:text-black transition-all"
        >
          <ArrowLeft size={16} /> Back
        </button>
      )}
      {children}
    </div>
  </div>
);
