import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  X,
  ChevronDown,
  ChevronUp,
  Check,
  Copy,
  Loader2,
  UploadCloud,
  Plus,
  Trash2,
  Edit2,
  AlertCircle,
  HelpCircle,
  FileCheck,
  Users,
  User,
  ShieldCheck 
} from "lucide-react";
import { useStore } from "../../store/useStore";

import { EscrowService } from "../../services/EscrowService";
import { rpc, Keypair, TransactionBuilder, Networks, Contract, nativeToScVal, xdr, Address, Account, Horizon } from "@stellar/stellar-sdk";
import { LocalCryptoUtil } from "../../utils/LocalCryptoUtil";
import { useYieldOracle } from '../../hooks/useYieldOracle';
import { api } from "../../lib/api"; 

// 🌐 ENVIRONMENT-AWARE API ROUTING
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

const QUICK_AMOUNTS = ["50", "100", "200", "500", "1,000"];

// const SYSTEM_APY = 0.13; 

type Step = 1 | 2 | 3;
type UploadState = "idle" | "uploading" | "success";

interface GroupRecipient {
  id: string;
  email: string;
  amount: string;
  claimableAfter: string;
  dueDate: string;
}

interface SendMoneyProps {
  onClose: () => void;
  prefillEmail?: string; 
  prefillAmount?: string | number; 
  startInBulkMode?: boolean; // NEW PROP HERE
}

const isValidEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const formatNumber = (val: string) => {
  if (!val) return "";
  let clean = val.replace(/[^0-9.]/g, "");
  const parts = clean.split(".");

  if (parts.length > 2) {
    clean = parts[0] + "." + parts.slice(1).join("");
  }

  const [integer, fraction] = clean.split(".");
  const formattedInt = integer
    ? parseInt(integer, 10).toLocaleString("en-US")
    : "";

  if (clean.includes(".")) {
    return `${formattedInt}.${fraction.slice(0, 2)}`;
  }
  return formattedInt;
};

const getTodayDate = () => new Date().toISOString().split("T")[0];

/*
const getCurrentDateTimeLocal = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};
*/

const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

const formatYieldDate = (dateStr?: string | null) => {
  if (!dateStr) return "";
  const dateObj = new Date(dateStr);
  if (isNaN(dateObj.getTime())) return ""; 

  const month = dateObj.toLocaleString("en-US", { month: "short" });
  const day = dateObj.getDate();
  const year = dateObj.getFullYear();
  const suffix =
    day === 1 || day === 21 || day === 31
      ? "st"
      : day === 2 || day === 22
      ? "nd"
      : day === 3 || day === 23
      ? "rd"
      : "th";
  
  // 🛡️ THE UX FIX: Display the exact time if the user provided it via datetime-local
  let timeStr = "";
  if (dateStr.includes("T")) {
     timeStr = ", " + dateObj.toLocaleTimeString("en-US", { hour: '2-digit', minute: '2-digit' });
  }

  return `${month} ${day}${suffix}, ${year}${timeStr}`;
};

const calculateYieldData = (
  amountStr?: string | null,
  dueDateStr?: string | null,
  apyRate: number = 0.13 // 🌟 NEW: Pass the rate dynamically
) => {
  const amount = parseFloat(amountStr?.replace(/,/g, "") || "") || 0;
  if (amount <= 0) return null;

  const dailyYield = (amount * apyRate) / 365;
  const weeklyYield = (amount * apyRate) / 52;

  if (dueDateStr) {
    const start = new Date(getTodayDate()).getTime();
    const end = new Date(dueDateStr).getTime();

    if (!isNaN(start) && !isNaN(end)) {
      const diffDays = Math.max(
        0,
        Math.ceil((end - start) / (1000 * 60 * 60 * 24))
      );
      if (diffDays > 0) {
        return {
          hasDueDate: true,
          totalEarned: (dailyYield * diffDays).toFixed(4),
          formattedDate: formatYieldDate(dueDateStr),
          daily: dailyYield.toFixed(4),
          weekly: weeklyYield.toFixed(4),
        };
      }
    }
  }

  return {
    hasDueDate: false,
    daily: dailyYield.toFixed(4),
    weekly: weeklyYield.toFixed(4),
  };
};


// 🛡️ THE ENTERPRISE BLOCKCHAIN ERROR SANITIZER
const sanitizeBlockchainError = (errorMsg: string): string => {
  if (!errorMsg) return "Transaction failed on the blockchain. Please try again.";
  const msg = errorMsg.toLowerCase();

  if (msg.includes("unreachablecodereached") && msg.includes("transfer")) {
    return "Insufficient on-chain USDC balance to complete this transaction. Please fund your wallet.";
  }
  if (msg.includes("opnotrust") || msg.includes("trustline")) {
    return "Your wallet is missing the USDC trustline required to interact with this contract.";
  }
  if (msg.includes("timeout") || msg.includes("exceeded")) {
    return "The blockchain network is currently congested. Please try again in a few moments.";
  }

  // 🛡️ THE FIX: Expose raw Soroban panics directly to the UI
  return `Blockchain Error: ${errorMsg}`;
};

export const SendMoneyToEmail = ({ onClose, prefillEmail, prefillAmount, startInBulkMode }: SendMoneyProps) => {
  // Fetch live yield from the backend Oracle
  const { apy, isLoading: isYieldLoading } = useYieldOracle();
  const SYSTEM_APY = apy / 100; // Convert 6.15 to 0.0615 for the math functions

  // 🌟 PERFECTED: Rely strictly on the globally locked Zustand state
  const activeAccount = useStore((state: any) => state.activeAccount);
  const updateAccountBalance = useStore((state: any) => state.updateAccountBalance); // 🔥 ADDED MUTATOR

  const [step, setStep] = useState<Step>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<{ id: number; message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now();
    setToast({ id, message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.id === id ? null : prev));
    }, 5000);
  };

  const [amount, setAmount] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [notifyCollection, setNotifyCollection] = useState(true); 
  const [sendToGroups, setSendToGroups] = useState(false);

  // 🌟 NEW: Identity Resolution State
  const [resolvedUser, setResolvedUser] = useState<{name: string} | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  // 🌟 NEW: Debounced Identity Resolution Effect
  useEffect(() => {
      if (isValidEmail(recipientEmail)) {
          setIsResolving(true);
          const timeoutId = setTimeout(async () => {
              try {
                  const res = await api.get(`/users/lookup?email=${recipientEmail}`);
                  if (res.data.isBlinkUser) setResolvedUser({ name: res.data.name });
                  else setResolvedUser(null);
              } catch (e) { setResolvedUser(null); }
              setIsResolving(false);
          }, 500);
          return () => clearTimeout(timeoutId);
      } else {
          setResolvedUser(null);
      }
  }, [recipientEmail]);

  useEffect(() => {
    if (prefillEmail) {
      setRecipientEmail(prefillEmail);
      setEmailTouched(true); 
    }
    // Inject the historical amount directly into the state
    if (prefillAmount) {
      setAmount(formatNumber(String(prefillAmount)));
    }
  }, [prefillEmail, prefillAmount]);

  // FIX: Instantly open the CSV Bulk Upload Modal if triggered from the Dashboard
  useEffect(() => {
      if (startInBulkMode) {
          // 1. Check the "Send to multiple recipients" box in the background UI
          setSendToGroups(true); 
          
          // 2. Open the exact drawer shown in your screenshot
          setIsBulkDrawerOpen(true); 
          
          // (We removed setIsUploadModalOpen(true) so it doesn't jump the gun)
      }
  }, [startInBulkMode]);

  const [showAdvance, setShowAdvance] = useState(false);
  const [claimableAfter, setClaimableAfter] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [yieldRecipient, setYieldRecipient] = useState("sender"); 
  const [note, setNote] = useState("");

  const [isGroupDrawerOpen, setIsGroupDrawerOpen] = useState(false);
  const [isBulkDrawerOpen, setIsBulkDrawerOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>("idle");

  const [groupRecipients, setGroupRecipients] = useState<GroupRecipient[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchError, setSearchError] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  
  const [generatedLink, setGeneratedLink] = useState("");
  // 1: Rich Recipient State (No longer just strings)
  const [savedEmails, setSavedEmails] = useState<{name: string, email: string}[]>([]);

  // 2: Secure DB Fetching using HttpOnly Cookies
  const loadSavedEmails = async () => {
    if (!activeAccount?.id) return;
    try {
      // 🛡️ THE CACHE BUSTER FIX: Ensures new emails show up instantly
      const res = await fetch(`${API_BASE}/users/${activeAccount.id}/recipients?_t=${Date.now()}`, {
        method: "GET",
        credentials: "include" 
      });
      
      if (res.ok) {
        const data = await res.json();
        
        // Map to rich objects so we can display their actual names in the dropdown
        const emailRecipients = data
          .filter((r: any) => r.type === "Email")
          .map((r: any) => ({
            name: r.name || (r.details || r.email).split("@")[0],
            email: r.details || r.email
          }));
        
        // Deduplicate in case of multiple saved records with the same email
        const uniqueEmails = new Map();
        emailRecipients.forEach((r: any) => {
          if (!uniqueEmails.has(r.email.toLowerCase())) {
            uniqueEmails.set(r.email.toLowerCase(), r);
          }
        });
        setSavedEmails(Array.from(uniqueEmails.values()));
      }
    } catch (e) {
      console.error("Failed to load saved emails", e);
    }
  };

  useEffect(() => {
    loadSavedEmails();
    window.addEventListener('bingtellar_recipients_updated', loadSavedEmails);
    return () => {
      window.removeEventListener('bingtellar_recipients_updated', loadSavedEmails);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccount?.id]);

  const numericAmount = parseFloat(amount.replace(/,/g, "")) || 0;
  const totalGroupAmount = groupRecipients.reduce(
    (sum, r) => sum + (parseFloat(r.amount.replace(/,/g, "")) || 0),
    0
  );
  const finalTotalAmount = groupRecipients.length > 0 ? totalGroupAmount : numericAmount;

  // 🌟 PERFECTED SSOT: We now strictly read the top-level `balance`. 
  // This guarantees the modal reacts instantly to the Zustand WebSocket memory injections.
  const currentBalance = parseFloat(activeAccount?.balance) || 0;
  
  const isEmailValid = isValidEmail(recipientEmail);
  const showEmailError = emailTouched && recipientEmail.length > 0 && !isEmailValid;

  const checkParadox = (claimStr?: string | null, dueStr?: string | null) => {
    if (dueStr) {
      // 🛡️ THE FIX: Treat Due Date as the very end of the day (23:59:59)
      // This prevents false "paradox" errors if Claim and Due dates are on the same day.
      const dDate = new Date(`${dueStr}T23:59:59`).getTime();
      const today = new Date().getTime();

      if (!isNaN(dDate) && dDate < today) return true;

      if (claimStr) {
        const cDate = new Date(claimStr).getTime();
        if (!isNaN(cDate) && !isNaN(dDate) && dDate <= cDate) return true;
      }
    }
    return false;
  };

  const isMainDateParadox = checkParadox(claimableAfter, dueDate);
  const isGroupDateParadox = groupRecipients.some((r) => checkParadox(r.claimableAfter, r.dueDate));
  const hasAnyDateParadox = isMainDateParadox || isGroupDateParadox;

  const calculatedFee = useMemo(() => {
    const totalRecipients = Math.max(1, groupRecipients.length);
    const perTxRate = 0.10;
    const MIN_FEE = 1.00;
    const MAX_FEE = 15.00;

    const rawFee = totalRecipients * perTxRate;
    
    // Clamp the fee between the $1.00 floor and the $15.00 ceiling
    return Math.min(Math.max(rawFee, MIN_FEE), MAX_FEE);
  }, [groupRecipients.length]);

  const totalDueAmount = finalTotalAmount + calculatedFee;
  const isOverBalance = totalDueAmount > currentBalance; 

  const isStep1Valid =
    !isOverBalance &&
    !hasAnyDateParadox &&
    finalTotalAmount > 0 &&
    (groupRecipients.length > 0 || isEmailValid) &&
    !groupRecipients.some(
      (r) => !r.amount || parseFloat(r.amount.replace(/,/g, "")) <= 0
    );

  const effectiveDueDate = useMemo(() => {
    if (groupRecipients.length > 0) {
      let maxDate = 0;
      let latestDateStr = "";
      groupRecipients.forEach((r) => {
        if (r.dueDate) {
          const dTime = new Date(r.dueDate).getTime();
          if (!isNaN(dTime) && dTime > maxDate) {
            maxDate = dTime;
            latestDateStr = r.dueDate;
          }
        }
      });
      return latestDateStr;
    }
    // 🛡️ THE FIX: Stop manipulating the date. Just return the exact user input.
    return dueDate; 
  }, [groupRecipients, dueDate]);

  const effectiveClaimDate = useMemo(() => {
    if (groupRecipients.length > 0) {
      let maxDate = 0;
      let latestDateStr = "";
      groupRecipients.forEach((r) => {
        if (r.claimableAfter) {
          const dTime = new Date(r.claimableAfter).getTime();
          if (!isNaN(dTime) && dTime > maxDate) {
            maxDate = dTime;
            latestDateStr = r.claimableAfter;
          }
        }
      });
      return latestDateStr;
    }
    // 🛡️ THE FIX: Removed the buggy 'split("T")[0]' and 'maxDate <= todayTime' checks.
    // If the user inputs a precise time, we pass the precise time!
    return claimableAfter; 
  }, [groupRecipients, claimableAfter]);


  const aggregatedYieldData = useMemo(() => {
    const dailyYield = (finalTotalAmount * SYSTEM_APY) / 365;
    const weeklyYield = (finalTotalAmount * SYSTEM_APY) / 52;

    let totalEarned = 0;
    let hasDueDates = false;
    let latestDate = 0;

    if (groupRecipients.length > 0) {
      hasDueDates = groupRecipients.some((r) => r.dueDate);
      if (hasDueDates) {
        groupRecipients.forEach((r) => {
          const amt = parseFloat(r.amount.replace(/,/g, "")) || 0;
          const rDue = r.dueDate || effectiveDueDate;
          if (amt > 0 && rDue) {
            const start = new Date(getTodayDate()).getTime();
            const end = new Date(rDue).getTime();
            if (!isNaN(start) && !isNaN(end)) {
              const diffDays = Math.max(0, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
              totalEarned += ((amt * SYSTEM_APY) / 365) * diffDays;
              if (end > latestDate) latestDate = end;
            }
          }
        });
      }
    } else if (dueDate) {
      hasDueDates = true;
      const start = new Date(getTodayDate()).getTime();
      const end = new Date(dueDate).getTime();
      if (!isNaN(start) && !isNaN(end)) {
        const diffDays = Math.max(0, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
        totalEarned = dailyYield * diffDays;
        latestDate = end;
      }
    }

    if (hasDueDates && totalEarned > 0 && latestDate > 0) {
      const dateObj = new Date(latestDate);
      const month = dateObj.toLocaleString("en-US", { month: "short" });
      const day = dateObj.getDate();
      const year = dateObj.getFullYear();
      const suffix = day === 1 || day === 21 || day === 31 ? "st" : day === 2 || day === 22 ? "nd" : day === 3 || day === 23 ? "rd" : "th";

      return {
        hasDueDates: true,
        totalEarned: totalEarned.toFixed(4),
        formattedDate: `${month} ${day}${suffix}, ${year}`,
        daily: dailyYield.toFixed(4),
        weekly: weeklyYield.toFixed(4),
      };
    }

    return { hasDueDates: false, daily: dailyYield.toFixed(4), weekly: weeklyYield.toFixed(4) };
  }, [finalTotalAmount, dueDate, effectiveDueDate, groupRecipients]);

  const renderContextAwareText = (amountObj: any, dateStr?: string | null, isTwoLines: boolean = false) => {
    if (amountObj?.totalEarned && dateStr) {
      const boldTotal = <span className="font-bold">~${amountObj.totalEarned}</span>;

      if (yieldRecipient === "sender") {
        return isTwoLines ? <>You will earn {boldTotal}<br />by {dateStr}</> : <>You will earn {boldTotal} by {dateStr}.</>;
      }
      if (yieldRecipient === "recipient") {
        return isTwoLines ? <>Recipient earns an extra {boldTotal} bonus<br />by {dateStr}</> : <>Recipient earns an extra {boldTotal} bonus by {dateStr}.</>;
      }
      return isTwoLines ? <>You and recipient will split {boldTotal}<br />by {dateStr}</> : <>You and recipient will split {boldTotal} by {dateStr}.</>;
    }

    const rateText = `$${amountObj?.daily || "0.00"}/day • $${amountObj?.weekly || "0.00"}/week`;
    const boldRate = <span className="font-bold">{rateText}</span>;

    if (yieldRecipient === "sender") return isTwoLines ? <>You earn {boldRate}</> : <>You earn {boldRate}.</>;
    if (yieldRecipient === "recipient") return isTwoLines ? <>Recipient earns {boldRate}</> : <>Recipient earns {boldRate}.</>;
    return isTwoLines ? <>You and recipient split {boldRate}</> : <>You and recipient split {boldRate}.</>;
  };

  useEffect(() => {
    if (groupRecipients.length > 1) {
      setSendToGroups(true);
    } else if (groupRecipients.length === 0) {
      setSendToGroups(false);
    }
  }, [groupRecipients.length]);

  // 🛡️ THE FIX: Stop forcing today's date if the user wants an Instant transfer
  const parsedClaimableAfter = claimableAfter ? claimableAfter.split("T")[0] : "";

  const handleOpenGroupDrawer = () => {
    if (isEmailValid) {
      setGroupRecipients((prev) => {
        if (prev.find((r) => r.email === recipientEmail)) return prev;
        return [
          {
            id: generateId(),
            email: recipientEmail,
            amount: amount ? formatNumber(amount) : "0.00",
            claimableAfter: parsedClaimableAfter,
            dueDate: dueDate || "", 
          },
          ...prev,
        ];
      });
    }
    setRecipientEmail("");
    setIsGroupDrawerOpen(true);
  };

  const handleAddBulkRecipient = (email: string) => {
    setGroupRecipients((prev) => {
      if (prev.find((r) => r.email === email)) return prev;
      return [
        ...prev,
        {
          id: generateId(),
          email,
          amount: amount ? formatNumber(amount) : "0.00",
          claimableAfter: parsedClaimableAfter,
          dueDate: dueDate || "", 
        },
      ];
    });
    setSearchQuery("");
    setSearchError(false);
    
    // THE UX FIX: Close the search drawer and immediately open the Group Table drawer
    setIsBulkDrawerOpen(false);
    setIsGroupDrawerOpen(true); 
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (isValidEmail(searchQuery)) handleAddBulkRecipient(searchQuery);
      else setSearchError(true);
    }
  };

  const handleRemoveGroupRecipient = (id: string) => setGroupRecipients((prev) => prev.filter((r) => r.id !== id));

  const handleUpdateGroupField = (id: string, field: keyof GroupRecipient, value: string) => {
    setGroupRecipients((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          if (field === "amount") return { ...r, amount: formatNumber(value) };
          return { ...r, [field]: value };
        }
        return r;
      })
    );
  };

  const handleBlurAmount = (id: string, currentValue: string) => {
    if (!currentValue || currentValue === ".") handleUpdateGroupField(id, "amount", "0.00");
  };

  const handleConfirmGroup = () => setIsGroupDrawerOpen(false);

  const handleDownloadTemplate = () => {
    const csvContent = "Email,Amount\nalice@company.com,150.00\nbob.smith@gmail.com,2500\nhello@bingtellar,45.50";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'blink_bulk_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadState("uploading");
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const csvText = event.target?.result as string;
        if (csvText) {
          const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l);
          
          if (lines.length > 1) {
            const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
            let emailIdx = headers.findIndex(h => h.includes('email'));
            let amountIdx = headers.findIndex(h => h.includes('amount'));
            
            if (emailIdx === -1) emailIdx = 0;
            if (amountIdx === -1) amountIdx = 1;

            const newRecipients = lines.slice(1).map(line => {
              const cols = line.split(',').map(c => c.trim());
              const rowEmail = cols[emailIdx] || "";
              const rowAmount = cols[amountIdx] || "0.00";

              if (rowEmail && isValidEmail(rowEmail)) {
                return {
                  id: generateId(),
                  email: rowEmail,
                  amount: formatNumber(rowAmount) || "0.00",
                  claimableAfter: parsedClaimableAfter,
                  dueDate: dueDate || "",
                };
              }
              return null;
            }).filter(Boolean) as GroupRecipient[];

            setTimeout(() => {
              setUploadState("success");
              setTimeout(() => {
                setIsUploadModalOpen(false);
                setIsBulkDrawerOpen(false);
                setUploadState("idle");

                setGroupRecipients(prev => {
                  const existingEmails = new Set(prev.map(r => r.email));
                  const validNew = newRecipients.filter(r => !existingEmails.has(r.email));
                  return [...prev, ...validNew];
                });

                // THE UX FIX: Open the Group Table drawer so they can review their CSV data
                setIsGroupDrawerOpen(true);

                showToast(`Successfully imported ${newRecipients.length} recipients from CSV!`, "success");
                if (fileInputRef.current) fileInputRef.current.value = "";
              }, 1200);
            }, 1000);
          } else {
            setUploadState("idle");
            showToast("The CSV file appears to be empty or improperly formatted.", "error");
          }
        }
      };
      reader.onerror = () => {
        setUploadState("idle");
        showToast("Failed to read the CSV file.", "error");
      };
      reader.readAsText(file);
    }
  };

  const idempotencyKeyRef = useRef(`idem_${generateId()}`);

  const [deployStep, setDeployStep] = useState<string>("");

  // 🌟 SECURE POSTING: Saving individual email recipients securely to Postgres
  // 🌟 FIX 4: Secure Posting & Background Addressbook Sync
  const saveRecipientToDB = async (emailToSave: string) => {
    try {
      const res = await fetch(`${API_BASE}/users/${activeAccount?.id}/recipients`, {
         method: "POST",
         credentials: "include", // 🛡️ strictly require cookies
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({
            name: emailToSave.split("@")[0], 
            type: "Email",
            details: emailToSave,
            email: emailToSave
         })
      });

      if (res.ok) {
         // 🌟 Broadcast the global event to instantly sync the main RecipientsAddressbook!
         window.dispatchEvent(new Event('bingtellar_recipients_updated'));
      }
    } catch(e) {
      console.warn("Failed to auto-save recipient to address book");
    }
  };

  const executeEscrowTransaction = async () => {
    if (pinInput.length < 6) return;
    setIsLoading(true);
    setPinError("");

    let displayLink = "";
    const isBulk = groupRecipients.length > 1;

    const finalRecipientEmail = groupRecipients.length > 1 
      ? "Multiple Recipients" 
      : (groupRecipients.length === 1 ? groupRecipients[0].email : recipientEmail);

    const singleAmount = groupRecipients.length === 1 
      ? parseFloat(groupRecipients[0].amount.replace(/,/g, "")) || 0 
      : numericAmount;

    const singleClaimableAfter = groupRecipients.length === 1 
      ? groupRecipients[0].claimableAfter 
      : effectiveClaimDate;

    const singleDueDate = groupRecipients.length === 1 
      ? groupRecipients[0].dueDate 
      : dueDate;

    // 🛡️ THE TITANIUM DATE ENGINE (Crash-Proof & Contract-Safe)
    const processDates = (claimDate?: string, providedDueDate?: string) => {
        let claimObj = claimDate && claimDate.trim() ? new Date(claimDate) : undefined;
        if (claimObj && isNaN(claimObj.getTime())) claimObj = undefined;

        let dueObj = providedDueDate && providedDueDate.trim() ? new Date(providedDueDate) : undefined;
        if (dueObj && isNaN(dueObj.getTime())) dueObj = undefined;

        // 3. The Open-Ended Lock Enforcer
        // If a Claim Date exists but Due Date is empty, force an expiry 30 days later
        if (claimObj && !dueObj) {
            dueObj = new Date(claimObj.getTime());
            dueObj.setDate(dueObj.getDate() + 30);
            dueObj.setUTCHours(23, 59, 59, 999);
        }

        // 4. The Overlap Resolver
        // Guarantees Due Date is always mathematically greater than Claim Date
        if (claimObj && dueObj) {
            if (dueObj.getTime() <= claimObj.getTime()) {
                dueObj = new Date(claimObj.getTime() + (24 * 60 * 60 * 1000));
                dueObj.setUTCHours(23, 59, 59, 999);
            }
        }

        return { 
            claimableAfter: claimObj ? claimObj.toISOString() : undefined, 
            dueDate: dueObj ? dueObj.toISOString() : undefined 
        };
    };

    // 🌟 UNIVERSAL ROUTING
    const payloadRecipients = isBulk ? groupRecipients.map(r => {
        const dates = processDates(r.claimableAfter, r.dueDate);
        return {
            email: r.email,
            amount: parseFloat(r.amount.replace(/,/g, "")).toString(),
            feeAmount: (calculatedFee / groupRecipients.length).toString(),
            claimableAfter: dates.claimableAfter,
            dueDate: dates.dueDate,
            yieldRecipient: yieldRecipient
        };
    }) : [{
        email: finalRecipientEmail,
        amount: singleAmount.toString(),
        feeAmount: calculatedFee.toString(),
        ...processDates(singleClaimableAfter, singleDueDate),
        yieldRecipient: yieldRecipient
    }];

    try {
      setDeployStep("Decrypting Vault...");
      let rawSecretKey = "";
      
      let secureKeyToDecrypt = activeAccount?.encryptedWalletKey;
      
      if (!secureKeyToDecrypt) {
        const sessionData = localStorage.getItem("bingtellar_user");
        if (sessionData) {
          secureKeyToDecrypt = JSON.parse(sessionData).encryptedWalletKey;
        }
      }

      if (!secureKeyToDecrypt) {
         throw new Error("Critical: Secure key missing from session. Please log out and back in.");
      }

      try {
        rawSecretKey = await LocalCryptoUtil.decrypt(secureKeyToDecrypt, pinInput);
      } catch (e) {
        throw new Error("Incorrect PIN. Decryption failed.");
      }

      if (!rawSecretKey || !rawSecretKey.startsWith("S")) {
         throw new Error("Incorrect PIN. Invalid key returned.");
      }

      // 🌟 DYNAMIC NETWORK ROUTING
      const isMainnet = import.meta.env.VITE_STELLAR_NETWORK === 'mainnet';
      const horizonUrl = isMainnet ? "https://horizon.stellar.org/" : "https://horizon-testnet.stellar.org/";
      const sorobanUrl = isMainnet ? "https://mainnet.sorobanrpc.com/" : "https://soroban-testnet.stellar.org/";
      const currentNetwork = isMainnet ? Networks.PUBLIC : Networks.TESTNET;

      const userKeypair = Keypair.fromSecret(rawSecretKey);
      const sorobanServer = new rpc.Server(sorobanUrl); 
      const horizonServer = new Horizon.Server(horizonUrl);

      setDeployStep("Fetching Contract Args...");
      
      let payloads;
      try {
        const result = await EscrowService.buildDeployTx({ recipients: payloadRecipients });
        payloads = result.payloads;
      } catch (e: any) {
        throw new Error(`Escrow Service Error: ${e.message}`);
      }

      let baseAccount;
      try {
        baseAccount = await horizonServer.loadAccount(userKeypair.publicKey());
      } catch (e: any) {
        if (e.message && e.message.includes("404")) {
          throw new Error("Account not activated on-chain. Please contact support to complete treasury provisioning.");
        }
        throw new Error(`Horizon Error: Wallet not found. (${e.message})`);
      }
      
      let currentSeq = BigInt(baseAccount.sequenceNumber());

      if (!activeAccount?.id) throw new Error("User session lost. Please log in again.");
      const realCreatorId = activeAccount.id;

      setDeployStep(`Securing ${payloads.length} Vault(s)...`);
      
      // 🌟 NEW BULK ARRAY: We store them here instead of calling the API in the loop
      const bulkPayloadArray = [];

      for (let i = 0; i < payloads.length; i++) {
        const payload = payloads[i];
        const recipientData = payloadRecipients[i];
        const { args, claimCode } = payload;
        
        const factory = new Contract(args.factoryContractId);
        const deploySalt = crypto.getRandomValues(new Uint8Array(32)); 
        // 🛡️ THE BULLETPROOF XDR ENCODER
        // 1. STRICT OPTION HANDLING (Using Void for None to prevent 1970 paradox)
        const claimableAtVal = (!args.claimableAtSecs || String(args.claimableAtSecs) === "0") 
            ? xdr.ScVal.scvVoid() 
            : nativeToScVal(BigInt(args.claimableAtSecs), { type: 'u64' });
            
        const expiryTimestampVal = (!args.expiryTimestamp || String(args.expiryTimestamp) === "0") 
            ? xdr.ScVal.scvVoid() 
            : nativeToScVal(BigInt(args.expiryTimestamp), { type: 'u64' });

        // 2. DYNAMIC YIELD PARAMETERS
        // Instant transfers MUST retain 100% of funds (10000 bps) to prevent Error 11 Insolvency.
        // If it's a Lock agreement, keep 10% in reserve and send 90% to Defindex. Platform takes 5% of the *yield*.
        // If it's Instant, keep 100% in reserve (0 bps routed) so it doesn't bankrupt the vault on immediate claim.
        const reserveRatio = args.agreementTypeStr === "Lock" ? 1000 : 10000; 
        const platformFee = args.agreementTypeStr === "Lock" ? 500 : 0; 

        // 🛡️ STRICT 16-FIELD ALPHABETICAL MAP (Reverting the Length-Based Error)
        const configMap = xdr.ScVal.scvMap([
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("agreement_type"), val: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(args.agreementTypeStr)]) }),
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("arbitrator"), val: new Address(userKeypair.publicKey()).toScVal() }),
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("asset"), val: new Address(args.assetAddress).toScVal() }),
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("base_fee"), val: nativeToScVal(BigInt(args.feeStroops || 0), { type: "i128" }) }),
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("cancellation_fee"), val: nativeToScVal(BigInt(args.feeStroops || 0), { type: "i128" }) }),
            // claim_hash (_) comes before claimable_at (a) in ASCII
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("claim_hash"), val: nativeToScVal(Buffer.from((args.claimHashHex || '').replace(/^0x/, ''), 'hex'), { type: 'bytes' }) }), 
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("claimable_at"), val: claimableAtVal }), 
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("defindex_address"), val: new Address(args.defindexAddress).toScVal() }),
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("expiry_timestamp"), val: expiryTimestampVal }), 
            // platform_address (a) comes before platform_fee_bps (f)
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("platform_address"), val: new Address(args.platformAddress).toScVal() }),
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("platform_fee_bps"), val: nativeToScVal(platformFee, { type: 'u32' }) }),
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("principal"), val: nativeToScVal(BigInt(args.principalStroops || 0), { type: 'i128' }) }),
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("reserve_ratio_bps"), val: nativeToScVal(reserveRatio, { type: 'u32' }) }), 
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("sender"), val: new Address(userKeypair.publicKey()).toScVal() }),
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("share_token_address"), val: new Address(args.defindexAddress).toScVal() }),
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("yield_policy"), val: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(args.yieldPolicyStr)]) })
        ]);

        const simAccount = new Account(userKeypair.publicKey(), currentSeq.toString());
        const tx = new TransactionBuilder(simAccount, { fee: "1000000", networkPassphrase: currentNetwork })
          .addOperation(factory.call("deploy_escrow", 
              nativeToScVal(Buffer.from(args.vaultWasmHash, "hex"), { type: 'bytes' }), 
              nativeToScVal(Buffer.from(deploySalt), { type: 'bytes' }), 
              configMap 
          ))
          .setTimeout(180)
          .build();

        let simulatedTx;
        try {
          simulatedTx = await sorobanServer.simulateTransaction(tx);
        } catch (e: any) { throw new Error(`Soroban RPC Simulation Error: ${e.message}`); }
        
        if (rpc.Api.isSimulationError(simulatedTx)) {
            throw new Error(`Simulation failed: ${simulatedTx.error || "Contract parameters invalid."}`);
        }

        const assembledTx = rpc.assembleTransaction(tx, simulatedTx).build();
        assembledTx.sign(userKeypair);


        // Save to our array instead of firing the API immediately
        bulkPayloadArray.push({
            // Pass STANDARD DECIMALS to Postgres, not Stroops!
            amountLocked: recipientData.amount,
            feeAmount: recipientData.feeAmount,
            
            recipientEmail: recipientData.email,
            title: note || `Payment to ${recipientData.email}`,
            note: note, // Pass the raw note directly to the backend
            claimableAfter: recipientData.claimableAfter ? new Date(recipientData.claimableAfter).toISOString() : undefined,
            expiryDate: recipientData.dueDate ? new Date(recipientData.dueDate).toISOString() : undefined,
            notifyOnClaim: notifyCollection,
            claimCode: claimCode,
            signedXdr: assembledTx.toXDR() // The raw signature
        });
        
        currentSeq++; // Increment seq safely in memory

        // ENTERPRISE FIX: THE PACING ENGINE
        // Soroban public RPCs limit you to ~10 requests per second.
        // We pause for 150ms between simulations, meaning a 100-vendor 
        // payroll batch compiles smoothly in 15 seconds without rate-limit crashes!
        if (i < payloads.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 150));
        }
      }

      setDeployStep("Finalizing Sync...");
    

      // THE MASTER SPLIT: Route Bulk vs Single safely to the backend
      if (isBulk) {
        const totalAmount = bulkPayloadArray.reduce((acc, val) => acc + parseFloat(val.amountLocked), 0);
        const totalFee = bulkPayloadArray.reduce((acc, val) => acc + parseFloat(val.feeAmount), 0);
        
        // ONE single API call for all bulk users
        await EscrowService.createBulkEscrows({
          creatorId: realCreatorId,
          totalAmountLocked: totalAmount.toString(),
          totalFeeAmount: totalFee.toString(),
          bulkData: bulkPayloadArray
          // ENTERPRISE FIX: Pass the idempotency key explicitly so your service can attach it to the headers
        }, idempotencyKeyRef.current);
        
        displayLink = "Bulk Links Emailed to Recipients automatically.";
      } else {
        // ONE single API call for a solo user
        const singleData = bulkPayloadArray[0];
        const res = await EscrowService.createEscrow({
          creatorId: realCreatorId, 
          amountLocked: singleData.amountLocked,
          feeAmount: singleData.feeAmount,
          recipientEmail: singleData.recipientEmail,
          title: singleData.title,
          claimableAfter: singleData.claimableAfter,
          expiryDate: singleData.expiryDate,
          notifyOnClaim: singleData.notifyOnClaim,
          claimCode: singleData.claimCode,
          // 🌟 ENTERPRISE FIX: Still passing it here, but ensure your service extracts it for the headers!
        }, idempotencyKeyRef.current);

        // THE DEFENSIVE UI FIX: Handle both response shapes safely
        const finalClaimId = res?.escrow?.claimId || res?.claimId;
        
        if (!finalClaimId) {
            throw new Error("Transaction logged, but server did not return a valid Claim ID.");
        }

        await EscrowService.submitSponsoredTx(finalClaimId, singleData.signedXdr);
        
        const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL || "http://localhost:5173";
        displayLink = `${FRONTEND_URL}/claim/${finalClaimId}`;
      }

      // Cleanup & UI State
      bulkPayloadArray.forEach(p => saveRecipientToDB(p.recipientEmail));
      idempotencyKeyRef.current = `idem_${generateId()}`;

      // 🌟 OPTIMISTIC UI: Instantly deduct the total due amount from Zustand
      updateAccountBalance(activeAccount.id, Math.max(0, currentBalance - totalDueAmount));

      // 🌟 PREVENT RACE CONDITION: Delay the background sync while the blockchain settles
      setTimeout(() => {
          window.dispatchEvent(new Event('BLINK_ONCHAIN_SYNC'));
      }, 8000);

      window.dispatchEvent(new Event('optimistic_payment_sent'));

      // 🌟 AGENTIC FEEDBACK LOOP
      window.dispatchEvent(new CustomEvent('agentic_transaction_success', {
        detail: {
          type: 'payment',
          data: {
            amount: finalTotalAmount,
            currency: 'USDC',
            recipient: isBulk ? `${bulkPayloadArray.length} Recipients` : finalRecipientEmail,
            link: displayLink,
            isBulk
          }
        }
      }));

      setGeneratedLink(displayLink);
      setStep(3);
      setShowPinModal(false);

    } catch (error: any) {
      console.error("Execution error:", error);
      // Pass the raw wall of text through our sanitizer before showing the user
      const cleanErrorMessage = sanitizeBlockchainError(error.message);
      setPinError(cleanErrorMessage);
    } finally {
      setIsLoading(false);
      setDeployStep("");
    }
  };

  const handleShareLink = async () => {
    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      showToast("Link Copied to clipboard!", "success");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      showToast("Failed to copy link", "error");
      console.error("Failed to copy link:", error);
    }
  };

  // 🌟 FIX 3: Multi-parameter search filter
  const searchResults = useMemo(() => {
    if (searchQuery.length < 2) return [];
    const query = searchQuery.toLowerCase();
    
    return savedEmails.filter(
      (rec) =>
        (rec.email.toLowerCase().includes(query) || rec.name.toLowerCase().includes(query)) &&
        !groupRecipients.find((gr) => gr.email.toLowerCase() === rec.email.toLowerCase())
    );
  }, [searchQuery, groupRecipients, savedEmails]);

  return (
    <div className="fixed inset-0 z-[9999] bg-[#F5F4EF] flex flex-col overflow-hidden animate-in fade-in duration-300">
      
      {/* 🌟 PIN VERIFICATION MODAL */}
      {showPinModal && (
        <div className="fixed inset-0 z-[10010] flex justify-center items-center bg-black/40 backdrop-blur-md p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-[24px] shadow-2xl overflow-hidden animate-in zoom-in-95 p-8 text-center relative">
            <button 
              onClick={() => setShowPinModal(false)}
              disabled={isLoading}
              className="absolute top-4 right-4 text-gray-400 hover:text-black transition-colors"
            >
              <X size={18} />
            </button>

            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-blue-100">
              <ShieldCheck size={32} className="text-blue-600" />
            </div>
            <h2 className="text-[20px] font-bold text-[#1A1A1A] mb-2">Authorize Transfer</h2>
            <p className="text-[14px] text-gray-500 mb-8 leading-relaxed">
              Enter your 6-digit PIN to securely authorize/sign and lock <b>${finalTotalAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</b> into escrow.
            </p>
            
            <input 
              type="password" 
              maxLength={6} 
              autoFocus
              value={pinInput}
              onChange={(e) => {
                setPinInput(e.target.value.replace(/\D/g, ''));
                setPinError("");
              }}
              placeholder="••••••" 
              disabled={isLoading}
              className={`w-full bg-[#FAFAFA] border rounded-xl px-4 py-4 text-[24px] text-center tracking-[0.3em] font-bold outline-none transition-all mb-4 ${
                pinError ? "border-red-400 focus:bg-white" : "border-[#E8E7E1] focus:border-black focus:bg-white"
              }`}
            />
            
            {pinError && <p className="text-red-500 text-[12px] font-bold mb-4 animate-in fade-in">{pinError}</p>}

            <button 
              onClick={executeEscrowTransaction}
              disabled={isLoading || pinInput.length < 6} 
              className="w-full bg-black text-white h-14 rounded-xl font-bold text-[15px] shadow-lg hover:bg-gray-800 transition-all flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {isLoading ? (
                <>
                  <Loader2 size={18} className="animate-spin shrink-0" /> 
                  <span className="truncate max-w-[200px] pl-2">{deployStep}</span>
                </>
              ) : (
                "Confirm & Sign"
              )}
            </button>
          </div>
        </div>
      )}

      {/* GLOBAL TOAST OVERLAY */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[10050] animate-in slide-in-from-top-4 fade-in duration-300">
          <div className={`px-4 py-3 rounded-xl shadow-2xl border flex items-center gap-3 max-w-sm w-max ${
            toast.type === 'success' ? 'bg-[#E8F5E9] border-[#C6F6D5] text-[#1A1A1A]' :
            toast.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
            'bg-white border-[#D1D5DB] text-[#111827]'
          }`}>
            {toast.type === 'success' && <Check size={18} className="text-[#34A853]" />}
            {toast.type === 'error' && <AlertCircle size={18} className="text-red-500" />}
            {toast.type === 'info' && <AlertCircle size={18} className="text-[#2775CA]" />}
            <span className="text-[13px] font-bold whitespace-pre-wrap leading-snug">{toast.message}</span>
            <button onClick={() => setToast(null)} className="ml-2 opacity-50 hover:opacity-100 transition-opacity">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* HEADER & PROGRESS BAR */}
      <header className="shrink-0 w-full bg-[#F5F4EF] z-40 px-6 py-5 flex items-center justify-between border-b border-[#E8E8E8]">
        <div className="w-1/3">
          <h1 className="text-[20px] font-bold text-[#111827] tracking-tight">
            Blink
          </h1>
        </div>
        <div className="w-1/3 flex justify-center">
          <div className="w-full max-w-[200px] h-[4px] bg-[#E5E7EB] rounded-full overflow-hidden flex">
            <div
              className="h-full bg-[#111827] transition-all duration-500 ease-in-out rounded-full"
              style={{
                width: step === 1 ? "33%" : step === 2 ? "66%" : "100%",
              }}
            />
          </div>
        </div>
        <div className="w-1/3 flex justify-end">
          <button
            onClick={onClose}
            aria-label="Close payment modal"
            className="w-9 h-9 bg-white rounded-full flex items-center justify-center hover:bg-gray-50 shadow-sm border border-[#D1D5DB] transition-colors"
          >
            <X size={16} className="text-[#111827]" />
          </button>
        </div>
      </header>

      {/* MAIN CONTENT CONTAINER */}
      <main className="flex-1 w-full overflow-y-auto">
        <div className="w-full max-w-[460px] mx-auto pt-8 sm:pt-10 pb-20 px-4">
          {/* STEP 1: FORM DESIGN */}
          {step === 1 && (
            <div className="w-full animate-in slide-in-from-bottom-4">
              <h2 className="text-[28px] font-medium text-[#111827] mb-8 tracking-tight">
                Send a payment
              </h2>

              <div className="space-y-6">
                {/* AMOUNT FIELD */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[13px] font-medium text-[#4B5563]">
                      Amount in USD
                    </label>
                    <span
                      className={`text-[12px] font-medium ${
                        isOverBalance
                          ? "text-red-600 flex items-center gap-1"
                          : "text-[#6B7280]"
                      }`}
                    >
                      {isOverBalance && <AlertCircle size={12} />}
                      {isOverBalance
                        ? "Exceeds balance"
                        : `Balance: $${currentBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </span>
                  </div>

                  <div
                    className={`flex items-center bg-white border rounded-xl px-4 py-1.5 shadow-sm transition-all ${
                      isOverBalance
                        ? "border-red-400 focus-within:ring-1 focus-within:ring-red-400"
                        : "border-[#D1D5DB] focus-within:border-[#111827] focus-within:ring-1 focus-within:ring-[#111827]"
                    }`}
                  >
                    <span className="text-[#9CA3AF] text-[24px] font-medium mr-2">
                      $
                    </span>
                    <input
                      type="text"
                      autoFocus 
                      value={
                        groupRecipients.length > 0
                          ? totalGroupAmount.toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                            })
                          : amount
                      }
                      onChange={(e) => setAmount(formatNumber(e.target.value))}
                      disabled={groupRecipients.length > 0}
                      placeholder="0.00"
                      className={`w-full bg-transparent text-[28px] font-medium text-[#111827] outline-none py-2 placeholder-[#D1D5DB] ${
                        groupRecipients.length > 0
                          ? "opacity-50 cursor-not-allowed"
                          : ""
                      }`}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2 mt-3">
                    {QUICK_AMOUNTS.map((val) => (
                      <button
                        key={val}
                        disabled={groupRecipients.length > 0}
                        onClick={() => setAmount(val.replace(",", ""))}
                        className="px-3.5 py-1.5 rounded-lg border border-[#D1D5DB] bg-white text-[12px] font-medium text-[#374151] hover:border-[#111827] hover:text-[#111827] disabled:opacity-50 transition-colors shadow-sm"
                      >
                        ${val}
                      </button>
                    ))}
                  </div>
                </div>

                {/* RECIPIENT EMAIL */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[13px] font-medium text-[#4B5563]">
                      Recipient
                    </label>
                    <button
                      onClick={handleOpenGroupDrawer}
                      className="text-[12px] font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
                    >
                      {groupRecipients.length > 0 ? (
                        <>
                          <Edit2 size={14} /> Edit Batch details
                        </>
                      ) : (
                        <>
                          <Plus size={14} /> Batch upload
                        </>
                      )}
                    </button>
                  </div>

                  {groupRecipients.length > 0 ? (
                    <div className="w-full min-h-[56px] border border-[#D1D5DB] bg-white rounded-xl p-2 flex flex-wrap gap-2 items-center shadow-sm">
                      {groupRecipients.map((r) => (
                        <div
                          key={r.id}
                          className="bg-[#F3F4F6] border border-[#E5E7EB] pl-3 pr-1 py-1 rounded-[8px] flex items-center gap-2 text-[13px] font-medium text-[#111827]"
                        >
                          {r.email}
                          <button
                            onClick={() => handleRemoveGroupRecipient(r.id)}
                            aria-label={`Remove ${r.email}`}
                            className="text-[#9CA3AF] hover:text-red-500 hover:bg-red-50 p-1 rounded-md transition-colors"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={handleOpenGroupDrawer}
                        className="text-[13px] font-medium text-[#6B7280] hover:text-[#111827] ml-1 px-3 py-1.5 rounded-lg hover:bg-[#F3F4F6] transition-colors"
                      >
                        Add more
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        type="email"
                        value={recipientEmail}
                        onChange={(e) => {
                          setRecipientEmail(e.target.value);
                          if (!emailTouched) setEmailTouched(true);
                        }}
                        onBlur={() => setEmailTouched(true)}
                        placeholder="Email address"
                        className={`w-full bg-white border rounded-xl py-3.5 px-4 text-[14px] shadow-sm outline-none transition-all ${
                          showEmailError
                            ? "border-red-400 focus:ring-1 focus:ring-red-400"
                            : "border-[#D1D5DB] focus:border-[#111827] focus:ring-1 focus:ring-[#111827]"
                        }`}
                      />
                      {isEmailValid && (
                        <Check
                          size={18}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-[#34A853]"
                        />
                      )}
                    </div>
                  )}

                  {/* 🌟 NEW: The Identity Resolution Trust Badge */}
                  {isResolving && groupRecipients.length === 0 && (
                    <p className="text-[12px] text-gray-500 mt-2 flex items-center gap-1">
                      <Loader2 size={12} className="animate-spin" /> Resolving user...
                    </p>
                  )}
                  {resolvedUser && !isResolving && groupRecipients.length === 0 && (
                    <div className="bg-[#E8F5E9] border border-[#C6F6D5] rounded-xl p-3 flex items-center gap-2 mt-2 animate-in fade-in">
                      <ShieldCheck size={16} className="text-[#34A853] shrink-0" />
                      <p className="text-[12px] font-bold text-[#1A1A1A]">
                        Verified Blink User: <span className="text-[#34A853]">{resolvedUser.name}</span>
                      </p>
                    </div>
                  )}

                  {showEmailError && groupRecipients.length === 0 && (
                    <p className="text-red-500 text-[12px] mt-1.5 font-medium">
                      Please enter a valid email format.
                    </p>
                  )}
                </div>

                {/* CHECKBOXES */}
                <div className="space-y-3 pt-2">
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={notifyCollection}
                      onChange={(e) => setNotifyCollection(e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded border-[#D1D5DB] text-[#111827] focus:ring-[#111827] accent-[#111827] cursor-pointer shrink-0"
                    />
                    <div className="flex flex-col">
                      <span className="text-[14px] font-medium text-[#374151]">
                        Notify me when claimed
                      </span>
                      <span className="text-[12px] text-[#6B7280] mt-0.5">
                        Get detailed tracking updates when opened, verified, and claimed.
                      </span>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={sendToGroups}
                      onChange={(e) => {
                        const isChecked = e.target.checked;
                        setSendToGroups(isChecked);
                        if (isChecked) {
                          // Instantly trigger the group mode and open the drawer
                          handleOpenGroupDrawer();
                        } else {
                          // Revert safely back to single-recipient mode if unchecked
                          if (groupRecipients.length > 0) {
                            setRecipientEmail(groupRecipients[0].email);
                            setAmount(groupRecipients[0].amount);
                            setGroupRecipients([]);
                          }
                        }
                      }}
                      className="w-4 h-4 rounded border-[#D1D5DB] text-[#111827] focus:ring-[#111827] accent-[#111827] cursor-pointer shrink-0"
                    />
                    <span className="text-[14px] font-medium text-[#374151]">
                      Send to multiple recipients
                    </span>
                  </label>
                </div>

                <div className="w-full h-[1px] bg-[#D1D5DB] my-4" />

                {/* ADVANCE ACTIONS */}
                <div>
                  <button
                    onClick={() => setShowAdvance(!showAdvance)}
                    className="flex items-center gap-2 text-[14px] font-medium text-[#111827] hover:text-[#4B5563] transition-colors"
                  >
                    {showAdvance ? (
                      <ChevronUp size={16} />
                    ) : (
                      <ChevronDown size={16} />
                    )}{" "}
                    Advanced options
                  </button>

                  {showAdvance && (
                    <div className="mt-5 space-y-4 animate-in slide-in-from-top-2">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white border border-[#D1D5DB] rounded-xl p-3 shadow-sm focus-within:border-[#111827] focus-within:ring-1 focus-within:ring-[#111827] transition-all">
                          <label className="text-[11px] font-medium text-[#6B7280] block mb-1">
                            Claim After
                          </label>
                          {/* 🛡️ THE UX FIX: Claim After Date Picker */}
                          <input
                            type="date"
                            value={claimableAfter ? claimableAfter.split("T")[0] : ""}
                            min={getTodayDate()}
                            onChange={(e) => {
                              const selectedDate = e.target.value;
                              setClaimableAfter(selectedDate ? `${selectedDate}T12:00` : "");
                            }}
                            className="w-full text-[13px] font-medium text-[#111827] bg-transparent outline-none cursor-pointer"
                          />
                        </div>
                        <div className="bg-white border border-[#D1D5DB] rounded-xl p-3 shadow-sm focus-within:border-[#111827] focus-within:ring-1 focus-within:ring-[#111827] transition-all">
                          <label className="text-[11px] font-medium text-[#6B7280] block mb-1">
                            Due Date
                          </label>
                          {/* 🛡️ THE UX FIX: Due Date Picker */}
                          <input
                            type="date"
                            value={dueDate ? dueDate.split("T")[0] : ""}
                            min={
                              claimableAfter
                                ? claimableAfter.split("T")[0]
                                : getTodayDate()
                            }
                            onChange={(e) => {
                              const selectedDate = e.target.value;
                              setDueDate(selectedDate ? `${selectedDate}T23:59` : "");
                            }}
                            className={`w-full text-[13px] font-medium bg-transparent outline-none transition-colors cursor-pointer ${
                              isMainDateParadox
                                ? "text-red-500"
                                : "text-[#111827]"
                            }`}
                          />
                        </div>
                      </div>

                      {isMainDateParadox && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2 shadow-sm animate-in fade-in">
                          <AlertCircle
                            size={16}
                            className="text-red-500 shrink-0 mt-0.5"
                          />
                          <div>
                            <p className="text-[12px] font-bold text-red-600 mb-0.5">
                              Date Conflict
                            </p>
                            <p className="text-[11px] text-red-500 font-medium">
                              Due date must be after the claimable date (or
                              today).
                            </p>
                          </div>
                        </div>
                      )}

                      {finalTotalAmount > 0 && !isMainDateParadox && (
                        <div className="bg-[#E8F5E9] border border-[#C6F6D5] rounded-xl p-3 flex items-start gap-2 shadow-sm animate-in fade-in">
                          {isYieldLoading ? (
                            <Loader2 size={16} className="text-[#34A853] shrink-0 mt-0.5 animate-spin" />
                            ) : (
                            <Check size={16} className="text-[#34A853] shrink-0 mt-0.5" />
                          )}
                        <div>
                        <p className="text-[12px] font-bold text-[#1A1A1A] mb-0.5 flex items-center gap-2">
                        Yield Alert 
                          {isYieldLoading ? (
                            <span className="w-12 h-3 bg-[#C6F6D5] animate-pulse rounded"></span>
                            ) : (
                            <span className="text-[#34A853]">({apy}% APY)</span>
                          )}
                        </p>
                        <p className="text-[11px] text-[#34A853] font-medium">
                            {isYieldLoading ? (
                             "Calculating real-time market yield..."
                              ) : (
                              renderContextAwareText(
                                aggregatedYieldData,
                                aggregatedYieldData.formattedDate
                              )
                            )}
                          </p>
                        </div>
                      </div>
                      )}

                      <div className="bg-white border border-[#D1D5DB] rounded-xl p-3 shadow-sm focus-within:border-[#111827] focus-within:ring-1 focus-within:ring-[#111827] transition-all relative">
                        <label className="text-[11px] font-medium text-[#6B7280] mb-1 flex items-center gap-1">
                          Yield Recipient{" "}
                          <span
                            title="Determines who earns the interest generated while the funds are held in escrow."
                            className="cursor-help flex items-center"
                          >
                            <HelpCircle size={12} className="text-[#9CA3AF]" />
                          </span>
                        </label>
                        <select
                          value={yieldRecipient}
                          onChange={(e) => setYieldRecipient(e.target.value)}
                          className="w-full text-[13px] font-medium text-[#111827] bg-transparent appearance-none outline-none cursor-pointer"
                        >
                          <option value="sender">Sender (You)</option>
                          <option value="recipient">Recipient</option>
                          <option value="split">Sender and Recipient</option>
                        </select>
                        <ChevronDown
                          size={14}
                          className="absolute right-4 bottom-3 text-[#9CA3AF] pointer-events-none"
                        />
                      </div>

                      <div className="bg-white border border-[#D1D5DB] rounded-xl p-3 shadow-sm focus-within:border-[#111827] focus-within:ring-1 focus-within:ring-[#111827] transition-all">
                        <label className="text-[11px] font-medium text-[#6B7280] block mb-1">
                          Internal Note
                        </label>
                        <textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Optional memo..."
                          className="w-full text-[13px] font-medium text-[#111827] bg-transparent outline-none resize-none h-[50px]"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-6">
                  <button
                    disabled={!isStep1Valid}
                    onClick={() => setStep(2)}
                    className={`w-full py-4 rounded-xl font-medium text-[15px] transition-all shadow-sm ${
                      isStep1Valid
                        ? "bg-[#111827] text-white hover:bg-black active:scale-[0.98]"
                        : "bg-[#E5E7EB] text-[#9CA3AF] cursor-not-allowed shadow-none"
                    }`}
                  >
                    Review Details
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: REVIEW */}
          {step === 2 && (
            <div className="w-full animate-in slide-in-from-right-4">
              <h2 className="text-[28px] font-medium text-[#111827] mb-8 tracking-tight">
                Review payment
              </h2>

              <div className="bg-white rounded-2xl border border-[#D1D5DB] shadow-sm overflow-hidden mb-8">
                <div className="p-6 border-b border-[#E5E7EB] bg-[#F9FAFB] flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white border border-[#E5E7EB] rounded-xl flex items-center justify-center shrink-0 shadow-sm">
                      {groupRecipients.length > 1 ? (
                        <Users size={20} className="text-[#374151]" />
                      ) : (
                        <User size={20} className="text-[#374151]" />
                      )}
                    </div>
                    <div>
                      <p className="text-[12px] font-medium text-[#6B7280] mb-0.5">
                        Sending to
                      </p>
                      <p className="text-[15px] font-medium text-[#111827]">
                        {groupRecipients.length > 1
                          ? "Multiple Recipients"
                          : groupRecipients.length === 1
                          ? groupRecipients[0].email
                          : recipientEmail}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setStep(1)}
                    className="text-[13px] font-medium text-[#6B7280] hover:text-[#111827] transition-colors border border-[#E5E7EB] bg-white px-3 py-1.5 rounded-lg shadow-sm"
                  >
                    Edit
                  </button>
                </div>

                <div className="p-6 space-y-5">
                  {groupRecipients.length > 1 && (
                    <div className="flex justify-between items-center">
                      <span className="text-[14px] text-[#6B7280]">
                        Total beneficiaries
                      </span>
                      <span className="text-[14px] font-medium text-[#111827]">
                        {groupRecipients.length}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-[14px] text-[#6B7280]">
                      Distribution amount
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-medium text-[#111827]">
                        {groupRecipients.length > 1 ? "~" : ""}$
                        {finalTotalAmount.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                        })}{" "}
                        USD
                      </span>
                      <button
                        onClick={() => setStep(1)}
                        aria-label="Edit amount"
                        className="text-[#9CA3AF] hover:text-[#111827] transition-colors"
                      >
                        <Edit2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[14px] text-[#6B7280]">
                      Claimable after
                    </span>
                    <span className="text-[14px] font-medium text-[#111827]">
                      {effectiveClaimDate
                        ? formatYieldDate(effectiveClaimDate)
                        : "Immediately"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[14px] text-[#6B7280]">Due date</span>
                    <span className="text-[14px] font-medium text-[#111827]">
                      {effectiveDueDate
                        ? formatYieldDate(effectiveDueDate)
                        : "None"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[14px] text-[#6B7280]">
                      Yield recipient
                    </span>
                    <span className="text-[14px] font-medium text-[#111827] capitalize">
                      {yieldRecipient === "sender" ? "Sender (You)" : yieldRecipient}
                    </span>
                  </div>
                  {note && (
                    <div className="flex justify-between items-start gap-4">
                      <span className="text-[14px] text-[#6B7280] shrink-0">
                        Note
                      </span>
                      <span className="text-[14px] font-medium text-[#111827] text-right break-words max-w-[200px]">
                        {note}
                      </span>
                    </div>
                  )}
                </div>

                <div className="p-6 border-t border-[#E5E7EB] bg-[#F9FAFB] space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-[14px] text-[#6B7280]">
                      Service fee
                    </span>
                    <span className="text-[14px] font-medium text-[#111827]">
                      ${calculatedFee.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      USD
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[14px] text-[#6B7280]">
                      Network fee
                    </span>
                    <span className="text-[14px] font-medium text-[#111827]">
                      $0.00 USD
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-4 border-t border-[#D1D5DB]">
                    <span className="text-[15px] font-bold text-[#111827]">
                      Total Due
                    </span>
                    <span className="text-[18px] font-bold text-[#111827]">
                      ${totalDueAmount.toLocaleString(
                        "en-US",
                        {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }
                      )}{" "}
                      USD
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="px-6 py-4 rounded-xl font-medium text-[15px] bg-white border border-[#D1D5DB] text-[#374151] hover:bg-[#F9FAFB] transition-colors shadow-sm"
                >
                  Back
                </button>
                <button
                  onClick={() => { setPinInput(""); setShowPinModal(true); }} 
                  className="flex-1 py-4 rounded-xl font-medium text-[15px] bg-[#111827] text-white hover:bg-black transition-all flex flex-col items-center justify-center shadow-sm"
                >
                  Confirm Payment
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: SUCCESS */}
          {step === 3 && (
            <div className="w-full animate-in zoom-in-95 duration-500 pt-8">
              <div className="bg-white rounded-2xl border border-[#D1D5DB] shadow-sm p-6 flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-[#E8F5E9] rounded-full flex items-center justify-center mb-4 shadow-sm border border-[#C6F6D5]">
                  <Check size={24} strokeWidth={3} className="text-[#34A853]" />
                </div>

                <h2 className="text-[20px] font-medium text-[#111827] mb-1 tracking-tight">
                  Transfer Sent
                </h2>
                <p className="text-[13px] text-[#6B7280] mb-5 leading-relaxed max-w-[260px]">
                  Your payment was successful.
                  <br />
                  (Funds are now in a safe escrow vault and ready for the
                  recipient to claim).
                </p>

                <div className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl py-4 px-4 mb-5">
                  <div className="text-[28px] font-medium text-[#111827] mb-1">
                    $
                    {finalTotalAmount.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    })}
                  </div>
                  <div className="text-[12px] font-medium text-[#34A853] mt-2 text-center">
                    {renderContextAwareText(
                      aggregatedYieldData,
                      aggregatedYieldData.formattedDate,
                      true
                    )}
                  </div>
                </div>

                <div className="w-full text-left mb-6">
                  <label className="text-[12px] font-medium text-[#374151] mb-2 block">
                    Share Link
                  </label>
                  <div className="flex items-center justify-between bg-white border border-[#D1D5DB] rounded-xl p-2 shadow-sm">
                    {/* --- UI LINK MASKING --- */}
                    <span className="text-[13px] text-[#4B5563] truncate mr-3 font-mono select-all pl-2">
                      {generatedLink.includes('?claim=') 
                        ? `${generatedLink.split('?claim=')[0]}?claim=••••••••••••••••` 
                        : generatedLink}
                    </span>
                    <button
                      onClick={handleShareLink}
                      aria-label="Copy share link"
                      className={`p-2 rounded-lg transition-colors border ${
                        copied
                          ? "bg-[#E8F5E9] border-[#34A853] text-[#34A853]"
                          : "bg-[#F9FAFB] border-[#E5E7EB] text-[#111827] hover:bg-[#F3F4F6]"
                      }`}
                    >
                      {copied ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>

                <div className="w-full space-y-2.5">
                  <button
                    onClick={handleShareLink}
                    className={`w-full py-3 rounded-xl font-medium text-[13px] transition-all flex items-center justify-center gap-2 shadow-sm ${
                      copied
                        ? "bg-[#34A853] text-white hover:bg-green-600"
                        : "bg-[#111827] text-white hover:bg-black"
                    }`}
                  >
                    {copied ? "Link Copied!" : "Copy Share Link"}
                  </button>
                  <button
                    onClick={() => {
                      setStep(1);
                      setAmount("");
                      setRecipientEmail("");
                      setEmailTouched(false);
                      setGroupRecipients([]);
                      setSendToGroups(false);
                      setNotifyCollection(true); 
                      setShowAdvance(false);
                      setClaimableAfter("");
                      setDueDate("");
                      setYieldRecipient("sender"); 
                      setNote("");
                    }}
                    className="w-full py-3 rounded-xl font-medium text-[13px] text-[#374151] border border-[#D1D5DB] hover:bg-[#F9FAFB] transition-all bg-white shadow-sm"
                  >
                    Send Another Payment
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* DRAWER 1: ENTER GROUP RECIPIENTS */}
      {isGroupDrawerOpen && (
        <div className="fixed inset-0 z-[10000]">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-[2px] animate-in fade-in duration-300"
            onClick={() => setIsGroupDrawerOpen(false)}
          />

          <div className="absolute inset-y-0 right-0 w-full sm:max-w-[520px] bg-white shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between p-6 border-b border-[#E8E8E8] shrink-0">
              <h2 className="text-[18px] font-bold text-[#1A1A1A]">
                Enter Group Recipients
              </h2>
              <button
                onClick={() => setIsGroupDrawerOpen(false)}
                aria-label="Close drawer"
                className="w-8 h-8 bg-[#F4E3BA] rounded-full flex items-center justify-center text-[#A67C00] hover:bg-[#E8C488] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-12 gap-3 px-6 py-4 bg-[#FAFAFA] border-b border-[#E8E8E8] text-[11px] font-bold text-[#A3A3A3] uppercase tracking-wide shrink-0">
              <div className="col-span-3">Beneficiary</div>
              <div className="col-span-3">Claim After</div>
              <div className="col-span-3">Due Date</div>
              <div className="col-span-2 text-right whitespace-nowrap pr-1">
                Amount ($)
              </div>
              <div className="col-span-1 text-center"></div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-3 min-h-0">
              {groupRecipients.length === 0 ? (
                <div className="flex flex-col items-center text-center mt-12 mb-6 animate-in fade-in">
                  <div className="w-12 h-12 bg-[#F3F4F6] rounded-full flex items-center justify-center mb-3">
                    <Users size={20} className="text-[#9CA3AF]" />
                  </div>
                  <p className="text-[14px] font-medium text-[#1A1A1A] mb-1">
                    No recipients added
                  </p>
                  <p className="text-[12px] text-[#757575] mb-6">
                    Add recipients below to send money to a group.
                  </p>
                  <button
                    onClick={() => setIsBulkDrawerOpen(true)}
                    className="flex items-center gap-1.5 text-[14px] font-bold text-[#1A1A1A] hover:underline underline-offset-4"
                  >
                    + Add Recipient
                  </button>
                </div>
              ) : (
                <>
                  {groupRecipients.map((recipient) => {
                    const rowYield = calculateYieldData(
                      recipient.amount,
                      recipient.dueDate
                    );
                    const hasRowParadox = checkParadox(
                      recipient.claimableAfter,
                      recipient.dueDate
                    );

                    return (
                      <div
                        key={recipient.id}
                        className={`border rounded-[12px] p-2.5 transition-colors flex flex-col gap-2 ${
                          hasRowParadox
                            ? "border-red-300 bg-red-50/30"
                            : "border-[#E8E8E8] hover:border-[#D1D4D7]"
                        }`}
                      >
                        <div className="grid grid-cols-12 gap-3 items-center">
                          <div
                            className="col-span-3 text-[12px] text-[#1A1A1A] truncate pr-1"
                            title={recipient.email}
                          >
                            {recipient.email}
                          </div>

                          <div className="col-span-3 relative">
                            {/* 🛡️ THE UX FIX: Group Drawer Claim After */}
                            <input
                              type="date"
                              value={recipient.claimableAfter ? recipient.claimableAfter.split("T")[0] : ""}
                              min={getTodayDate()}
                              onChange={(e) => {
                                const selectedDate = e.target.value;
                                handleUpdateGroupField(
                                  recipient.id,
                                  "claimableAfter",
                                  selectedDate ? `${selectedDate}T12:00` : ""
                                );
                              }}
                              className="w-full text-[11px] font-medium text-[#1A1A1A] bg-transparent outline-none focus:border-black transition-colors cursor-pointer"
                            />
                          </div>

                          <div className="col-span-3 relative">
                            {/* 🛡️ THE UX FIX: Group Drawer Due Date */}
                            <input
                              type="date"
                              value={recipient.dueDate ? recipient.dueDate.split("T")[0] : ""}
                              min={
                                recipient.claimableAfter
                                  ? recipient.claimableAfter.split("T")[0]
                                  : getTodayDate()
                              }
                              onChange={(e) => {
                                const selectedDate = e.target.value;
                                handleUpdateGroupField(
                                  recipient.id,
                                  "dueDate",
                                  selectedDate ? `${selectedDate}T23:59` : ""
                                );
                              }}
                              className={`w-full text-[11px] font-medium bg-transparent outline-none transition-colors cursor-pointer ${
                                hasRowParadox
                                  ? "text-red-500"
                                  : "text-[#1A1A1A] focus:border-black"
                              }`}
                            />
                          </div>

                          <div className="col-span-2 relative flex items-center">
                            <span className="absolute left-2 text-[#A3A3A3] text-[12px]">
                              $
                            </span>
                            <input
                              type="text"
                              value={
                                recipient.amount === "0.00"
                                  ? ""
                                  : recipient.amount
                              }
                              placeholder="0.00"
                              onChange={(e) =>
                                handleUpdateGroupField(
                                  recipient.id,
                                  "amount",
                                  e.target.value
                                )
                              }
                              onBlur={(e) =>
                                handleBlurAmount(recipient.id, e.target.value)
                              }
                              className={`w-full text-[12px] font-bold bg-white border border-[#E8E8E8] rounded-[8px] py-1.5 pl-5 pr-2 outline-none focus:border-black transition-colors text-right ${
                                recipient.amount === "0.00" ||
                                recipient.amount === ""
                                  ? "text-[#A3A3A3]"
                                  : "text-[#1A1A1A]"
                              }`}
                            />
                          </div>

                          <div className="col-span-1 flex items-center justify-end pr-1">
                            <button
                              onClick={() =>
                                handleRemoveGroupRecipient(recipient.id)
                              }
                              aria-label="Remove recipient"
                              className="text-[#A3A3A3] hover:text-red-500 transition-colors p-1"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>

                        {hasRowParadox ? (
                          <div className="bg-red-50 rounded-[6px] px-2.5 py-1.5 flex items-center gap-1.5 animate-in fade-in">
                            <AlertCircle size={12} className="text-red-500" />
                            <span className="text-[10px] font-medium text-red-600">
                              Due date cannot be before claim date.
                            </span>
                          </div>
                        ) : (
                          rowYield &&
                          recipient.amount &&
                          parseFloat(recipient.amount.replace(/,/g, "")) >
                            0 && (
                            <div className="bg-[#E8F5E9] rounded-[6px] px-2.5 py-1.5 flex items-center gap-1.5 animate-in fade-in">
                              <Check size={12} className="text-[#34A853]" />
                              <span className="text-[10px] font-medium text-[#34A853]">
                                {renderContextAwareText(
                                  rowYield,
                                  formatYieldDate(recipient.dueDate),
                                  false
                                )}
                              </span>
                            </div>
                          )
                        )}
                      </div>
                    );
                  })}

                  <button
                    onClick={() => setIsBulkDrawerOpen(true)}
                    className="mt-5 flex items-center gap-1.5 text-[14px] font-bold text-[#1A1A1A] hover:underline underline-offset-4"
                  >
                    + Add Recipient
                  </button>
                </>
              )}
            </div>

            <div className="p-6 pb-8 sm:pb-6 border-t border-[#E8E8E8] flex items-center justify-between bg-white shrink-0 mt-auto">
              <div className="text-[13px] text-[#757575]">
                {groupRecipients.length} in group
              </div>
              <div className="flex items-center gap-6">
                <div className="text-[15px] font-bold text-[#1A1A1A]">
                  Total: $
                  {totalGroupAmount.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                  })}
                </div>
                <button
                  disabled={hasAnyDateParadox}
                  onClick={handleConfirmGroup}
                  className={`px-6 py-3 rounded-[12px] text-[13px] font-bold transition-colors ${
                    hasAnyDateParadox
                      ? "bg-[#E8E8E8] text-[#A3A3A3] cursor-not-allowed"
                      : "bg-[#1A1A1A] text-white hover:bg-black"
                  }`}
                >
                  Confirm Group
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DRAWER 2: BULK PAYMENT RECIPIENTS */}
      {isBulkDrawerOpen && (
        <div className="fixed inset-0 z-[10010]">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-[2px] animate-in fade-in duration-300"
            onClick={() => setIsBulkDrawerOpen(false)}
          />

          <div className="absolute inset-y-0 right-0 w-full sm:max-w-[520px] bg-white shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between p-6 border-b border-[#FAFAFA] shrink-0">
              <h2 className="text-[18px] font-bold text-[#1A1A1A]">
                Bulk Payment Recipients
              </h2>
              <button
                onClick={() => setIsBulkDrawerOpen(false)}
                aria-label="Close drawer"
                className="w-8 h-8 bg-[#F4E3BA] rounded-full flex items-center justify-center text-[#A67C00] hover:bg-[#E8C488] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto min-h-0">
              <div className="relative mb-8">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (searchError) setSearchError(false);
                  }}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Enter recipient email to add beneficiary"
                  className={`w-full border rounded-[12px] p-4 text-[13px] bg-[#FAFAFA] outline-none transition-colors pr-10 ${
                    searchError
                      ? "border-red-400 focus:bg-white"
                      : "border-[#E8E8E8] focus:bg-white focus:border-black"
                  }`}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#A3A3A3] font-bold text-[14px]">
                  @
                </span>

                {searchError && (
                  <p className="text-red-500 text-[12px] mt-1.5 absolute -bottom-6 left-0">
                    Invalid email format
                  </p>
                )}

                {searchQuery.length > 1 && !searchError && (
                  <div className="absolute top-[110%] left-0 w-full bg-white border border-[#E8E8E8] shadow-xl rounded-[12px] z-20 py-2">
                    {searchResults.length > 0 ? (
                      searchResults.map((rec) => (
                        <div
                          key={rec.email}
                          onClick={() => handleAddBulkRecipient(rec.email)}
                          className="px-4 py-3 hover:bg-[#FAFAFA] cursor-pointer transition-colors flex items-center gap-3"
                        >
                          {/* 🌟 Rich Avatar & Name Display */}
                          <div className="w-8 h-8 rounded-full bg-[#F5F5F4] flex items-center justify-center text-[#757575] font-bold text-[11px] shrink-0 border border-[#E8E8E8]">
                            {rec.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[13px] font-bold text-[#1A1A1A]">{rec.name}</span>
                            <span className="text-[11px] text-[#757575]">{rec.email}</span>
                          </div>
                        </div>
                      ))
                    ) : isValidEmail(searchQuery) ? (
                      <div
                        onClick={() => handleAddBulkRecipient(searchQuery)}
                        className="px-4 py-3 hover:bg-[#FAFAFA] cursor-pointer text-[13px] text-[#1A1A1A] transition-colors flex items-center gap-2"
                      >
                        <Plus size={16} className="text-[#2775CA]" /> Add new:{" "}
                        <span className="font-bold">{searchQuery}</span>
                      </div>
                    ) : (
                      <div className="px-4 py-3 text-[13px] text-[#A3A3A3]">
                        Press enter to validate email
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-4 mb-8">
                <div className="flex-1 h-[1px] bg-[#E8E8E8]"></div>
                <span className="text-[12px] font-bold text-[#A3A3A3] uppercase tracking-widest">
                  OR
                </span>
                <div className="flex-1 h-[1px] bg-[#E8E8E8]"></div>
              </div>

              <div
                onClick={() => setIsUploadModalOpen(true)}
                className="border border-[#E8E8E8] rounded-[16px] p-5 flex items-center gap-4 cursor-pointer hover:border-black transition-colors group mb-6 bg-white"
              >
                <div className="w-12 h-12 bg-[#2775CA] rounded-full flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <div className="w-5 h-5 border-2 border-white rounded-[4px] relative flex items-center justify-center">
                    <div className="w-3 h-[2px] bg-white rounded-full"></div>
                  </div>
                </div>
                <div>
                  <h4 className="text-[14px] font-bold text-[#1A1A1A]">
                    Upload bulk payment file
                  </h4>
                  <p className="text-[13px] text-[#757575] mt-0.5">
                    Upload CSV bulk payment template
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2">
                <div className="w-10 h-10 bg-[#E8F0FE] rounded-full flex items-center justify-center shrink-0">
                  <ChevronDown size={18} className="text-[#2775CA]" />
                </div>
                <div className="pt-0.5">
                  <p className="text-[13px] text-[#757575] mb-0.5">
                    Don't have the template?
                  </p>
                  <button 
                    onClick={handleDownloadTemplate} 
                    className="text-[13px] font-bold text-[#2775CA] hover:underline underline-offset-2"
                  >
                    Download it here
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6 pb-8 sm:pb-6 border-t border-[#E8E8E8] flex items-center justify-between bg-white shrink-0 mt-auto">
              <button className="text-[13px] font-medium text-[#757575] underline underline-offset-4 hover:text-[#1A1A1A]">
                Need help? Learn more
              </button>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setIsBulkDrawerOpen(false)}
                  className="text-[13px] font-bold text-[#1A1A1A] hover:text-gray-600"
                >
                  Go back
                </button>
                <button
                  disabled
                  className="px-6 py-3 bg-[#E8E8E8] text-[#A3A3A3] rounded-[12px] text-[13px] font-bold cursor-not-allowed"
                >
                  Save
                </button>
              </div>
            </div>

            {isUploadModalOpen && (
              <div className="absolute inset-0 z-[70] flex items-center justify-center p-6 bg-black/20 backdrop-blur-[1px] animate-in fade-in duration-200">
                <div className="relative w-full bg-white rounded-[24px] shadow-2xl p-8 animate-in zoom-in-95 duration-200">
                  <button
                    onClick={() => {
                      setIsUploadModalOpen(false);
                      setUploadState("idle");
                    }}
                    aria-label="Close upload modal"
                    className="absolute top-5 right-5 w-8 h-8 bg-[#F5F5F4] rounded-full flex items-center justify-center hover:bg-[#E8E8E8] transition-colors"
                  >
                    <X size={16} className="text-[#1A1A1A]" />
                  </button>

                  <h2 className="text-[20px] font-bold text-[#1A1A1A] mb-2">
                    Upload File
                  </h2>
                  <p className="text-[13px] text-[#757575] mb-6 leading-relaxed pr-6">
                    Upload your bulk beneficiaries file for this transaction.
                    File should be CSV format.
                  </p>

                  <div
                    onClick={() =>
                      uploadState === "idle" && fileInputRef.current?.click()
                    }
                    className={`w-full border-2 border-dashed rounded-[16px] h-[160px] flex flex-col items-center justify-center mb-6 transition-colors ${
                      uploadState === "idle"
                        ? "border-[#A8C7FA] bg-[#F4F8FD] cursor-pointer hover:bg-[#E8F0FE] hover:border-[#2775CA]"
                        : uploadState === "uploading"
                        ? "border-[#E8E8E8] bg-[#FAFAFA]"
                        : "border-[#34A853] bg-[#E8F5E9]"
                    }`}
                  >
                    <input
                      type="file"
                      accept=".csv"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      className="hidden"
                    />

                    {uploadState === "idle" && (
                      <>
                        <UploadCloud
                          size={32}
                          className="text-[#2775CA] mb-3"
                        />
                        <p className="text-[14px] font-medium text-[#2775CA] mb-1">
                          Click here to upload
                        </p>
                        <p className="text-[12px] text-[#757575]">
                          Upload one CSV file
                        </p>
                      </>
                    )}

                    {uploadState === "uploading" && (
                      <div className="flex flex-col items-center">
                        <Loader2
                          size={32}
                          className="text-[#1A1A1A] animate-spin mb-3"
                        />
                        <p className="text-[13px] font-medium text-[#1A1A1A]">
                          Processing file...
                        </p>
                      </div>
                    )}

                    {uploadState === "success" && (
                      <div className="flex flex-col items-center animate-in zoom-in">
                        <div className="w-10 h-10 bg-[#34A853] rounded-full flex items-center justify-center mb-2">
                          <FileCheck size={20} className="text-white" />
                        </div>
                        <p className="text-[14px] font-bold text-[#34A853]">
                          Upload Successful!
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <button
                      onClick={() => setIsUploadModalOpen(false)}
                      className="w-full py-3.5 border border-[#E8E8E8] rounded-[12px] text-[14px] font-bold text-[#1A1A1A] hover:bg-[#FAFAFA] transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={uploadState !== "idle"}
                      onClick={() => fileInputRef.current?.click()}
                      className={`w-full py-3.5 rounded-[12px] text-[14px] font-bold transition-all shadow-sm ${
                        uploadState !== "idle"
                          ? "bg-[#E8E8E8] text-[#A3A3A3] cursor-not-allowed"
                          : "bg-[#1A1A1A] text-white hover:bg-black"
                      }`}
                    >
                      Browse files
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};