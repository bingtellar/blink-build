import { useState } from "react";
import {
  Send,
  Smartphone,
  Layers,
  CalendarDays,
  Mail,
  Link as LinkIcon,
  ChevronRight,
  ArrowUpRight,
  ArrowDownLeft,
  Info,
} from "lucide-react";
import { RequestPaymentFlow } from "./RequestPaymentFlow";
import { RequestpaymentEmailPhone } from "./RequestpaymentEmailPhone";
import { SendMoneyToEmail } from "./SendMoneyToEmail";
// 🌟 DELETED SendBulkPayments IMPORT

type PaymentTab = "send" | "request";
type PaymentView =
  | "menu"
  | "request-payme"
  | "request-direct"
  | "send-email"
  | "send-email-bulk";

interface PaymentsProps {}

export const Payments = ({}: PaymentsProps) => {
  const [activeTab, setActiveTab] = useState<PaymentTab>("send");
  const [currentView, setCurrentView] = useState<PaymentView>("menu");
  const [showToast, setShowToast] = useState(false);

  const handleComingSoon = () => {
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
    }, 3000);
  };

  const PaymentCard = ({
    title,
    description,
    mainIcon: MainIcon,
    subIcon: SubIcon,
    onClick,
    isComingSoon = false,
  }: {
    title: string;
    description: string;
    mainIcon: any;
    subIcon: any;
    onClick?: () => void;
    isComingSoon?: boolean;
  }) => (
    <div
      onClick={onClick}
      className={`border border-dashed border-[#D1D4D7] rounded-[24px] p-5 sm:p-6 flex items-start gap-4 sm:gap-5 transition-all group hover:bg-white hover:shadow-md ${
        isComingSoon
          ? "bg-white opacity-60 cursor-not-allowed hover:border-[#D1D4D7]"
          : "bg-[#FAFAFA] cursor-pointer hover:border-black hover:border-solid"
      }`}
    >
      <div className="relative shrink-0 mt-1">
        <div
          className={`w-11 h-11 sm:w-12 sm:h-12 bg-white border border-[#E8E8E8] shadow-sm rounded-full flex items-center justify-center transition-all duration-300 ${
            isComingSoon
              ? "text-[#A3A3A3]"
              : "text-[#1A1A1A] group-hover:bg-black group-hover:border-black group-hover:text-white"
          }`}
        >
          <MainIcon size={20} className="shrink-0" />
        </div>
        <div
          className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border-[2px] transition-colors duration-300 ${
            isComingSoon
              ? "bg-gray-300 border-white"
              : "bg-[#2775CA] border-[#FAFAFA] group-hover:border-white"
          }`}
        >
          <SubIcon size={10} className="text-white" strokeWidth={3} />
        </div>
      </div>

      <div className="flex-1 pr-2 sm:pr-4">
        <div className="flex items-center gap-2 mb-1">
          <h4
            className={`text-[13px] sm:text-[14px] font-bold transition-colors ${
              isComingSoon
                ? "text-[#757575]"
                : "text-[#1A1A1A] group-hover:text-[#2775CA]"
            }`}
          >
            {title}
          </h4>
          {isComingSoon && (
            <span className="bg-gray-100 text-gray-500 text-[9px] font-bold px-2 py-0.5 rounded-full tracking-wide uppercase">
              Soon
            </span>
          )}
        </div>
        <p className="text-[11px] sm:text-[12px] text-[#757575] leading-relaxed">
          {description}
        </p>
      </div>

      {!isComingSoon && (
        <ChevronRight
          size={18}
          className="text-[#A3A3A3] group-hover:text-[#1A1A1A] transition-colors shrink-0 hidden sm:block"
        />
      )}
    </div>
  );

  // --- SUB-VIEW ROUTING ---
  if (currentView === "request-payme") {
    return <RequestPaymentFlow onClose={() => setCurrentView("menu")} />;
  }

  if (currentView === "request-direct") {
    return <RequestpaymentEmailPhone onClose={() => setCurrentView("menu")} />;
  }

  // 🌟 SINGLE TRANSFER VIEW
  if (currentView === "send-email") {
    return <SendMoneyToEmail onClose={() => setCurrentView("menu")} />;
  }

  // 🌟 BULK TRANSFER VIEW: Open the exact same component, but pass the trigger prop
  if (currentView === "send-email-bulk") {
    return <SendMoneyToEmail onClose={() => setCurrentView("menu")} startInBulkMode={true} />; 
  }

  // --- DEFAULT MENU VIEW ---
  return (
    <>
      <div className="w-full h-full bg-white flex flex-col pt-4 px-4 sm:px-8 lg:px-12 pb-12 animate-in fade-in duration-300 relative">
        <div className="max-w-[960px] w-full">
          <div className="mb-6">
            <h1 className="text-[18px] sm:text-[20px] font-bold text-[#1A1A1A]">
              Payments
            </h1>
          </div>

          <div className="flex items-center gap-3 mb-8 sm:mb-12">
            <button
              onClick={() => setActiveTab("send")}
              className={`px-5 sm:px-6 py-2.5 rounded-full text-[12px] sm:text-[13px] font-bold transition-colors shadow-sm ${
                activeTab === "send"
                  ? "bg-black text-white"
                  : "bg-[#F5F5F4] text-[#1A1A1A] hover:bg-[#E8E8E8] shadow-none"
              }`}
            >
              Send
            </button>
            <button
              onClick={() => setActiveTab("request")}
              className={`px-5 sm:px-6 py-2.5 rounded-full text-[12px] sm:text-[13px] font-bold transition-colors shadow-sm ${
                activeTab === "request"
                  ? "bg-black text-white"
                  : "bg-[#F5F5F4] text-[#1A1A1A] hover:bg-[#E8E8E8] shadow-none"
              }`}
            >
              Request
            </button>
          </div>

          {activeTab === "send" && (
            <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4 sm:gap-6 animate-in slide-in-from-right-4 duration-300">
              <PaymentCard
                title="Send payment to Email"
                description="Send digital dollars directly to an email. The recipient can claim fund in over 150 countries."
                mainIcon={Send}
                subIcon={ArrowUpRight}
                onClick={() => setCurrentView("send-email")}
              />

              <PaymentCard
                title="Send bulk payments"
                description="Send payments to multiple people in a few seconds. Track and automate the entire process easily."
                mainIcon={Layers}
                subIcon={ArrowUpRight}
                onClick={() => setCurrentView("send-email-bulk")} // UPDATED VIEW TARGET
              />

              <PaymentCard
                title="Send payment to Phone Number"
                description="Send digital dollars directly to any phone. The recipient can claim fund in over 150 countries."
                mainIcon={Smartphone}
                subIcon={ArrowUpRight}
                onClick={handleComingSoon}
                isComingSoon={true}
              />

              <PaymentCard
                title="Scheduled transfer"
                description="Set up a transfer to send at a later date, add conditional logic to payments."
                mainIcon={CalendarDays}
                subIcon={ArrowUpRight}
                onClick={handleComingSoon}
                isComingSoon={true}
              />
            </div>
          )}

          {activeTab === "request" && (
            <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4 sm:gap-6 animate-in slide-in-from-left-4 duration-300">
              <PaymentCard
                title="Send payment request to Email, Phone or @X handles"
                description="Request money from friends by specifying their email, phone number, @social handle etc and they pay in a click."
                mainIcon={Mail}
                subIcon={ArrowDownLeft}
                onClick={() => setCurrentView("request-direct")}
              />
              <PaymentCard
                title="Payme - Request payment from anyone"
                description="A personalized link to receive money from anyone without their email. You can share this unique link via text, WhatsApp etc."
                mainIcon={LinkIcon}
                subIcon={ArrowDownLeft}
                onClick={() => setCurrentView("request-payme")}
              />
            </div>
          )}
        </div>
      </div>

      {showToast && (
        <div className="fixed top-8 sm:top-[120px] lg:top-[140px] right-4 sm:right-8 lg:right-12 z-[100] bg-[#34A853] text-white px-5 py-3.5 rounded-xl flex items-center gap-3 shadow-2xl animate-in slide-in-from-right-8 fade-in duration-300">
          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <Info size={16} className="text-white" />
          </div>
          <span className="text-[13px] font-bold pr-2 tracking-wide">
            This feature is coming soon!
          </span>
        </div>
      )}
    </>
  );
};