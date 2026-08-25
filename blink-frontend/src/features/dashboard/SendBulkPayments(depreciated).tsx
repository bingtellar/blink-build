import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  X,
  Upload,
  AlertCircle,
  Info,
  FileSpreadsheet,
  Download,
  Users,
  Building2,
  Copy,
  ChevronDown,
  ChevronUp,
  Trash2,
  FileCheck,
Check,
  Loader2,
  Edit2,
} from "lucide-react";
import { useStore } from "../../store/useStore"; // 🌟 ADDED ZUSTAND IMPORT

// --- MOCK DATA & CONSTANTS ---
const BATCH_FEE_PER_USER = 1.0;

interface ParsedRecipient {
  id: string;
  email: string;
  amount: number;
}

type UploadState = "idle" | "uploading" | "parsing" | "success" | "hasData";

export const SendBulkPayments = ({ onClose }: { onClose: () => void }) => {
  
  // 🌟 ZUSTAND: Pull data directly from the global cloud!
  const activeAccount = useStore((state) => state.activeAccount);
  const USER_BALANCE = activeAccount?.balance || 0; // 🌟 Replaced the hardcoded mock!

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // --- UPLOAD STATE ---
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadState>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");

  // --- BATCH DATA STATE ---
  const [recipients, setRecipients] = useState<ParsedRecipient[]>([]);
  const [showAdvance, setShowAdvance] = useState(false);
  const [batchNote, setBatchNote] = useState("");
  const [isProcessingTx, setIsProcessingTx] = useState(false);
  const [copied, setCopied] = useState(false);

  // Advance Settings State
  const [yieldRecipient, setYieldRecipient] = useState("Sender (You)");

  // --- SUCCESS PAGE STATE ---
  const [batchId] = useState(
    `BCH-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
  );

  // --- DERIVED MATH ---
  const totalBeneficiaries = recipients.length;
  const totalPayout = recipients.reduce((sum, r) => sum + r.amount, 0);
  const totalFees = totalBeneficiaries * BATCH_FEE_PER_USER;
  const grandTotal = totalPayout + totalFees;
  const isOverBalance = grandTotal > USER_BALANCE;

  // --- UPLOAD SIMULATION LOGIC ---
  const processMockFile = (name: string) => {
    setFileName(name);
    setUploadStatus("uploading");
    setUploadProgress(0);

    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 15;
      });
    }, 200);

    setTimeout(() => {
      setUploadStatus("parsing");
      setTimeout(() => {
        // Mock parsed data
        setRecipients([
          { id: "1", email: "engineering@company.com", amount: 4500.0 },
          { id: "2", email: "marketing@company.com", amount: 3200.5 },
          { id: "3", email: "sarah.contractor@gmail.com", amount: 150.0 },
          { id: "4", email: "james.freelance@yahoo.com", amount: 850.0 },
          { id: "5", email: "design.team@agency.com", amount: 2100.0 },
        ]);
        setUploadStatus("success");
      }, 1000);
    }, 1800);
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.endsWith(".csv")) {
      processMockFile(file.name);
    } else {
      alert("Please upload a valid CSV file.");
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processMockFile(file.name);
    }
  };

  const handleRemoveRecipient = (id: string) => {
    const newRecipients = recipients.filter((r) => r.id !== id);
    setRecipients(newRecipients);
    if (newRecipients.length === 0) {
      setUploadStatus("idle");
    }
  };

  const handleUpdateAmount = (id: string, val: string) => {
    const cleanVal = val.replace(/[^0-9.]/g, "");
    setRecipients(
      recipients.map((r) =>
        r.id === id ? { ...r, amount: parseFloat(cleanVal) || 0 } : r
      )
    );
  };

  const handleConfirmBatch = async () => {
    setIsProcessingTx(true);
    await new Promise((res) => setTimeout(res, 2000));
    setIsProcessingTx(false);
    setStep(3);
  };

  const handleShareLink = async () => {
    try {
      await navigator.clipboard.writeText(`https://blink.com/batch/${batchId}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {}
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#F5F4EF] flex flex-col overflow-y-auto animate-in fade-in duration-300">
      {/* HEADER */}
      <div className="sticky top-0 left-0 w-full bg-[#F5F4EF] z-40 px-6 py-5">
        <div className="max-w-[1200px] mx-auto flex items-center justify-between">
          <div className="w-1/3">
            <h1 className="text-[20px] font-bold text-[#1A1A1A] tracking-tight">
              Blink
            </h1>
          </div>
          <div className="w-1/3 flex justify-center">
            <div className="w-full max-w-[200px] h-[4px] bg-[#E8E8E8] rounded-full overflow-hidden flex">
              <div
                className="h-full bg-black transition-all duration-500 ease-in-out rounded-full"
                style={{
                  width: step === 1 ? "33%" : step === 2 ? "66%" : "100%",
                }}
              />
            </div>
          </div>
          <div className="w-1/3 flex justify-end">
            <button
              onClick={onClose}
              className="w-9 h-9 bg-white rounded-full flex items-center justify-center hover:bg-gray-100 shadow-sm border border-[#E8E8E8] transition-colors"
            >
              <X size={16} className="text-[#1A1A1A]" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center pt-4 sm:pt-6 pb-16 px-4">
        {/* STEP 1: UPLOAD BATCH */}
        {step === 1 && (
          <div className="w-full max-w-[440px] animate-in slide-in-from-bottom-4">
            <div className="text-center mb-6">
              <h2 className="text-[22px] font-bold text-[#1A1A1A] mb-1">
                Mass Payouts
              </h2>
              <p className="text-[13px] text-[#757575]">
                Upload your CSV payroll or affiliate list.
              </p>
            </div>

            <div className="bg-white rounded-[24px] border border-black p-6 shadow-sm">
              {/* DYNAMIC UPLOAD ZONE */}
              <div className="mb-6">
                <label className="text-[13px] font-bold text-[#1A1A1A] mb-3 flex items-center justify-between">
                  <span>Beneficiaries Data</span>
                  {uploadStatus === "hasData" && (
                    <button
                      onClick={() => {
                        setRecipients([]);
                        setUploadStatus("idle");
                        setFileName("");
                      }}
                      className="text-[#FF573A] text-[11px] font-medium hover:underline"
                    >
                      Clear list
                    </button>
                  )}
                </label>

                {uploadStatus === "idle" && (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleFileDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`w-full border-2 border-dashed rounded-[16px] p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 min-h-[180px] ${
                      isDragging
                        ? "border-[#2775CA] bg-[#F4F8FD] scale-[1.02]"
                        : "border-[#D1D4D7] bg-[#FAFAFA] hover:border-[#1A1A1A] hover:bg-white"
                    }`}
                  >
                    <input
                      type="file"
                      accept=".csv"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 transition-colors ${
                        isDragging
                          ? "bg-[#2775CA] text-white"
                          : "bg-white border border-[#E8E8E8] text-[#1A1A1A] shadow-sm"
                      }`}
                    >
                      <Upload size={18} />
                    </div>
                    <h3 className="text-[14px] font-bold text-[#1A1A1A] mb-1">
                      {isDragging
                        ? "Drop your CSV here"
                        : "Click or drag CSV to upload"}
                    </h3>
                    <p className="text-[12px] text-[#757575] max-w-[200px] leading-relaxed">
                      Maximum file size 10MB. Must include 'email' and 'amount'
                      columns.
                    </p>
                  </div>
                )}

                {/* PROCESSING STATE */}
                {(uploadStatus === "uploading" ||
                  uploadStatus === "parsing") && (
                  <div className="w-full border border-[#E8E8E8] bg-[#FAFAFA] rounded-[16px] p-6 flex flex-col items-center justify-center min-h-[180px] animate-in fade-in">
                    <div className="w-12 h-12 border-[3px] border-[#E8E8E8] border-t-[#2775CA] rounded-full animate-spin mb-4" />
                    <h3 className="text-[14px] font-bold text-[#1A1A1A] mb-2">
                      {uploadStatus === "uploading"
                        ? "Uploading file..."
                        : "Parsing rows..."}
                    </h3>
                    <div className="w-[60%] h-1 bg-[#E8E8E8] rounded-full overflow-hidden mb-2">
                      <div
                        className="h-full bg-[#2775CA] transition-all duration-200"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-[#757575] font-mono">
                      {fileName}
                    </p>
                  </div>
                )}

                {/* SUCCESS STATE */}
                {uploadStatus === "success" && (
                  <div className="w-full border border-[#34A853] bg-[#F0FDF4] rounded-[16px] p-6 flex flex-col items-center justify-center min-h-[180px] animate-in zoom-in-95 duration-300">
                    <div className="w-12 h-12 bg-[#34A853] rounded-full flex items-center justify-center mb-3 shadow-[0_4px_14px_rgba(52,168,83,0.3)]">
                      <FileCheck size={20} className="text-white" />
                    </div>
                    <h3 className="text-[16px] font-bold text-[#1A1A1A] mb-1">
                      File Processed!
                    </h3>
                    <p className="text-[12px] text-[#34A853] font-medium mb-5">
                      Successfully extracted {recipients.length} beneficiaries.
                    </p>
                    <button
                      onClick={() => setUploadStatus("hasData")}
                      className="w-full py-3 bg-[#1A1A1A] text-white rounded-[10px] text-[13px] font-bold hover:bg-black transition-all shadow-sm active:scale-[0.98]"
                    >
                      View Data Summary
                    </button>
                  </div>
                )}

                {/* HAS DATA PREVIEW STATE */}
                {uploadStatus === "hasData" && (
                  <div className="w-full border border-[#E8E8E8] bg-white rounded-[16px] p-5 shadow-[0_2px_10px_rgba(0,0,0,0.02)] animate-in fade-in">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#E8F0FE] rounded-full flex items-center justify-center shrink-0">
                          <FileSpreadsheet
                            size={16}
                            className="text-[#2775CA]"
                          />
                        </div>
                        <div>
                          <p className="text-[13px] font-bold text-[#1A1A1A] truncate max-w-[200px]">
                            {fileName}
                          </p>
                          <p className="text-[11px] text-[#757575] mt-0.5">
                            {recipients.length} beneficiaries ready
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-[#FAFAFA] rounded-[10px] p-4 flex items-center justify-between border border-[#E8E8E8]">
                      <span className="text-[12px] text-[#757575] font-medium">
                        Batch Total:
                      </span>
                      <span className="text-[16px] font-bold text-[#1A1A1A]">
                        $
                        {totalPayout.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  </div>
                )}

                {/* TEMPLATE DOWNLOAD (Only show if idle) */}
                {uploadStatus === "idle" && (
                  <div className="mt-4 flex items-center justify-between p-3.5 border border-[#E8E8E8] rounded-[12px] bg-white hover:border-[#D1D4D7] transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-[#FAFAFA] border border-[#E8E8E8] rounded-full flex items-center justify-center shrink-0">
                        <FileSpreadsheet size={14} className="text-[#1A1A1A]" />
                      </div>
                      <div>
                        <p className="text-[12px] font-bold text-[#1A1A1A]">
                          Need a template?
                        </p>
                        <p className="text-[11px] text-[#757575] mt-0.5">
                          Download our standard format
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => alert("Downloading CSV Template...")}
                      className="flex items-center gap-1 text-[11px] font-bold text-[#2775CA] hover:underline underline-offset-2"
                    >
                      <Download size={12} /> Download
                    </button>
                  </div>
                )}

                {/* Balance Alert */}
                {uploadStatus === "hasData" && (
                  <div className="mt-3 flex items-center justify-between px-1">
                    {isOverBalance ? (
                      <span className="text-[11px] font-medium text-red-500 flex items-center gap-1.5 animate-in fade-in">
                        <AlertCircle size={12} /> Exceeds available balance
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-[#757575]">
                        Available Balance
                      </span>
                    )}
                    <span
                      className={`text-[11px] font-bold ${
                        isOverBalance ? "text-red-500" : "text-[#1A1A1A]"
                      }`}
                    >
                      $
                      {USER_BALANCE.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                )}
              </div>

              <hr className="border-t border-dashed border-[#E8E8E8] mb-5" />

              {/* ADVANCE ACTIONS ACCORDION (Date fields removed) */}
              <div className="mb-6">
                <button
                  onClick={() => setShowAdvance(!showAdvance)}
                  className="flex items-center gap-2 text-[13px] font-bold text-[#1A1A1A] w-full hover:text-[#757575] transition-colors"
                >
                  {showAdvance ? (
                    <ChevronUp size={16} />
                  ) : (
                    <ChevronDown size={16} />
                  )}
                  Batch Settings (Optional)
                </button>

                {showAdvance && (
                  <div className="mt-5 space-y-4 animate-in slide-in-from-top-2 fade-in duration-300">
                    {/* Yield Recipient */}
                    <div>
                      <label className="flex items-center gap-1.5 text-[12px] font-medium text-[#757575] mb-2">
                        Yield Recipient{" "}
                        <Info
                          size={14}
                          className="text-[#A3A3A3] cursor-help"
                        />
                      </label>
                      <div className="relative">
                        <select
                          value={yieldRecipient}
                          onChange={(e) => setYieldRecipient(e.target.value)}
                          className="w-full border border-[#E8E8E8] rounded-[10px] p-3 text-[13px] text-[#1A1A1A] bg-[#FAFAFA] appearance-none outline-none focus:bg-white focus:border-black transition-colors cursor-pointer"
                        >
                          <option>Sender (You)</option>
                          <option>Recipient</option>
                          <option>Sender and Recipient</option>
                        </select>
                        <ChevronDown
                          size={14}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#A3A3A3] pointer-events-none"
                        />
                      </div>
                    </div>

                    {/* Note */}
                    <div>
                      <label className="text-[12px] font-medium text-[#757575] mb-2 block">
                        Internal Batch Memo
                      </label>
                      <textarea
                        value={batchNote}
                        onChange={(e) => setBatchNote(e.target.value)}
                        placeholder="e.g., October 2025 Payroll"
                        className="w-full border border-[#E8E8E8] rounded-[10px] p-3 text-[13px] text-[#1A1A1A] bg-[#FAFAFA] outline-none focus:bg-white focus:border-black transition-colors resize-none h-[70px]"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Continue Button */}
              <button
                disabled={uploadStatus !== "hasData" || isOverBalance}
                onClick={() => setStep(2)}
                className={`w-full py-3.5 rounded-[12px] font-bold text-[13px] transition-all ${
                  uploadStatus === "hasData" && !isOverBalance
                    ? "bg-[#1A1A1A] text-white hover:bg-black active:scale-[0.98] shadow-sm"
                    : "bg-[#F5F5F4] text-[#A3A3A3] cursor-not-allowed"
                }`}
              >
                Review Batch
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: REVIEW BATCH (Standardized width to 440px) */}
        {step === 2 && (
          <div className="w-full max-w-[440px] animate-in slide-in-from-right-4">
            <div className="flex items-center justify-between mb-5 px-1">
              <h2 className="text-[20px] font-bold text-[#1A1A1A]">
                Review Batch
              </h2>
              <button
                onClick={() => setStep(1)}
                className="text-[11px] font-bold text-[#757575] hover:text-[#1A1A1A] transition-colors flex items-center gap-1 bg-white px-3 py-1.5 rounded-full shadow-sm border border-[#E8E8E8]"
              >
                <ChevronDown size={14} className="rotate-90" /> Edit Batch
              </button>
            </div>

            <div className="bg-white rounded-[24px] border border-black p-6 shadow-sm overflow-hidden flex flex-col">
              {/* TOP SUMMARY CARDS */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="bg-[#FAFAFA] border border-[#E8E8E8] rounded-[14px] p-3.5">
                  <div className="flex items-center gap-2 text-[#757575] mb-1.5">
                    <Users size={14} />
                    <span className="text-[11px] font-medium">
                      Beneficiaries
                    </span>
                  </div>
                  <p className="text-[20px] font-bold text-[#1A1A1A] leading-none">
                    {totalBeneficiaries}
                  </p>
                </div>
                <div className="bg-[#FAFAFA] border border-[#E8E8E8] rounded-[14px] p-3.5">
                  <div className="flex items-center gap-2 text-[#757575] mb-1.5">
                    <Building2 size={14} />
                    <span className="text-[11px] font-medium">
                      Total Payout
                    </span>
                  </div>
                  <p className="text-[20px] font-bold text-[#1A1A1A] leading-none truncate">
                    $
                    {totalPayout.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                </div>
              </div>

              {/* EDITABLE DATA TABLE PREVIEW */}
              <div className="mb-5 border border-[#E8E8E8] rounded-[14px] overflow-hidden flex flex-col bg-[#FAFAFA]">
                <div className="px-3.5 py-2.5 border-b border-[#E8E8E8] flex items-center justify-between">
                  <h4 className="text-[11px] font-bold text-[#1A1A1A] uppercase tracking-wide flex items-center gap-2">
                    Parsed Data
                    <span className="bg-[#E8E8E8] text-[#757575] px-2 py-0.5 rounded-full text-[9px]">
                      Editable
                    </span>
                  </h4>
                  <span className="text-[10px] font-medium text-[#757575] truncate max-w-[100px]">
                    {fileName}
                  </span>
                </div>

                <div className="overflow-y-auto max-h-[180px] p-1.5 space-y-1 bg-white">
                  {recipients.length === 0 && (
                    <div className="text-center py-6 text-[12px] text-[#A3A3A3]">
                      No recipients remaining.
                    </div>
                  )}
                  {recipients.map((r, i) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between p-2 hover:bg-[#FAFAFA] rounded-[8px] transition-colors group"
                    >
                      <div className="flex items-center gap-2 overflow-hidden flex-1 pr-2">
                        <span className="text-[10px] font-mono text-[#A3A3A3] w-4 shrink-0">
                          {i + 1}
                        </span>
                        <p className="text-[12px] font-medium text-[#1A1A1A] truncate">
                          {r.email}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* INLINE EDITABLE AMOUNT */}
                        <div className="relative w-[85px]">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#757575] text-[12px]">
                            $
                          </span>
                          <input
                            type="text"
                            value={r.amount}
                            onChange={(e) =>
                              handleUpdateAmount(r.id, e.target.value)
                            }
                            className="w-full text-[12px] font-bold text-[#1A1A1A] bg-transparent border border-transparent hover:border-[#E8E8E8] focus:bg-white focus:border-black rounded-[6px] py-1.5 pl-5 pr-2 outline-none transition-colors text-right"
                          />
                        </div>
                        <button
                          onClick={() => handleRemoveRecipient(r.id)}
                          className="text-[#A3A3A3] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ADVANCE BATCH SETTINGS OVERVIEW (Claimable dates removed) */}
              <div className="mb-6 border border-[#E8E8E8] rounded-[14px] p-3.5 bg-[#FAFAFA]">
                <button
                  onClick={() => setShowAdvance(!showAdvance)}
                  className="flex items-center justify-between w-full"
                >
                  <span className="text-[12px] font-bold text-[#1A1A1A]">
                    Batch Settings Summary
                  </span>
                  {showAdvance ? (
                    <ChevronUp size={14} className="text-[#757575]" />
                  ) : (
                    <ChevronDown size={14} className="text-[#757575]" />
                  )}
                </button>

                {showAdvance && (
                  <div className="mt-3 pt-3 border-t border-[#E8E8E8] animate-in fade-in slide-in-from-top-2 space-y-2.5">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[#757575]">Yield Recipient:</span>
                      <span className="font-medium text-[#1A1A1A]">
                        {yieldRecipient}
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[#757575]">Memo:</span>
                      <span className="font-medium text-[#1A1A1A] truncate max-w-[200px] text-right">
                        {batchNote || "Mass Payout"}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* FINAL CALCULATION & PAY BUTTON */}
              <div className="bg-[#1A1A1A] text-white rounded-[16px] p-5 shadow-xl relative overflow-hidden">
                <div className="absolute -right-10 -top-10 w-24 h-24 bg-white/5 rounded-full blur-2xl pointer-events-none" />

                <div className="flex items-center justify-between mb-2.5 relative z-10">
                  <span className="text-[12px] text-white/70">Subtotal</span>
                  <span className="text-[13px] font-medium">
                    $
                    {totalPayout.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div className="flex items-center justify-between mb-3.5 pb-3.5 border-b border-white/10 relative z-10">
                  <span className="text-[12px] text-white/70">
                    Network & Batch Fees
                  </span>
                  <span className="text-[13px] font-medium">
                    $
                    {totalFees.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div className="flex items-end justify-between mb-5 relative z-10">
                  <span className="text-[13px] font-medium text-white">
                    Total Due
                  </span>
                  <div className="text-right">
                    <span className="text-[20px] font-bold block leading-none mb-1.5">
                      $
                      {grandTotal.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                    <span
                      className={`text-[10px] font-medium ${
                        isOverBalance ? "text-red-400" : "text-[#34A853]"
                      }`}
                    >
                      Balance: ${USER_BALANCE.toLocaleString()}
                    </span>
                  </div>
                </div>

                <button
                  disabled={
                    isProcessingTx || isOverBalance || recipients.length === 0
                  }
                  onClick={handleConfirmBatch}
                  className={`w-full py-3.5 rounded-[10px] font-bold text-[13px] transition-all flex items-center justify-center shadow-sm relative z-10 ${
                    isOverBalance || recipients.length === 0
                      ? "bg-white/10 text-white/50 cursor-not-allowed"
                      : "bg-white text-[#1A1A1A] hover:bg-gray-100 active:scale-[0.98]"
                  }`}
                >
                  {isProcessingTx ? (
                    <Loader2
                      size={16}
                      className="animate-spin text-[#1A1A1A]"
                    />
                  ) : (
                    "Confirm & Send Batch"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: SUCCESS (Standardized width to 440px) */}
        {step === 3 && (
          <div className="w-full max-w-[440px] animate-in zoom-in-95 duration-500">
            <div className="bg-white rounded-[24px] border border-black p-8 shadow-sm flex flex-col items-center text-center">
              <div className="w-14 h-14 bg-[#E8F5E9] rounded-full flex items-center justify-center mb-5">
                <Check size={28} strokeWidth={3} className="text-[#34A853]" />
              </div>

              <h2 className="text-[20px] font-bold text-[#1A1A1A] mb-2">
                Batch Processed Successfully
              </h2>
              <p className="text-[13px] text-[#757575] mb-6 max-w-[280px] leading-relaxed">
                Your mass payout of{" "}
                <span className="font-bold text-[#1A1A1A]">
                  {totalBeneficiaries} beneficiaries
                </span>{" "}
                has been initiated. Emails are being sent now.
              </p>

              <div className="w-full border border-[#E8E8E8] rounded-[16px] py-5 px-4 mb-6 bg-[#FAFAFA] shadow-sm">
                <div className="text-[28px] font-bold text-[#1A1A1A] mb-1">
                  $
                  {grandTotal.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                  })}
                </div>
                <div className="text-[12px] font-medium text-[#757575] mt-1.5">
                  Batch ID:{" "}
                  <span className="font-mono font-bold text-[#1A1A1A] bg-[#E8E8E8] px-2 py-0.5 rounded-[6px]">
                    {batchId}
                  </span>
                </div>
              </div>

              <div className="w-full text-left mb-6">
                <label className="text-[12px] font-bold text-[#1A1A1A] mb-1.5 block">
                  Copy internal tracking link:
                </label>
                <div className="flex items-center justify-between bg-[#F5F5F4] border border-[#E8E8E8] rounded-[10px] p-2.5 group">
                  <span className="text-[11px] text-[#757575] truncate mr-3 font-mono select-all">
                    https://blink.com/batch/{batchId}
                  </span>
                  <button
                    onClick={handleShareLink}
                    className="w-7 h-7 bg-white border border-[#D1D4D7] rounded-md hover:bg-gray-50 flex items-center justify-center shrink-0 transition-colors shadow-sm"
                  >
                    <Copy size={12} className="text-[#1A1A1A]" />
                  </button>
                </div>
              </div>

              <button
                onClick={() => {
                  setStep(1);
                  setUploadStatus("idle");
                  setRecipients([]);
                  setFileName("");
                  setBatchNote("");
                }}
                className="w-full py-3.5 rounded-[12px] font-bold text-[13px] text-[#1A1A1A] border border-black hover:bg-[#FAFAFA] transition-all"
              >
                Send Another Batch
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
