import { useEffect, useState } from "react";
import { PublicPayRequestFlow } from "./PublicPayRequestFlow";

export const PublicPaymentPage = () => {
  const [requestId, setRequestId] = useState<string | null>(null);

  useEffect(() => {
    // Look for ?pay_req=REF123 in the URL
    const urlParams = new URLSearchParams(window.location.search);
    const reqId = urlParams.get('pay_req');
    
    if (reqId) {
      setRequestId(reqId);
    }
  }, []);

  if (!requestId) {
    return (
      <div className="h-screen w-full bg-[#F5F5F5] flex items-center justify-center">
        <p className="text-[#757575] font-medium text-[14px]">Invalid or missing payment link.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#F5F5F5]">
      {/* We pass isOpen={true} so it's always visible on this standalone page.
        onClose simply redirects them back to the root website.
      */}
      <PublicPayRequestFlow 
        isOpen={true} 
        onClose={() => window.location.href = "/"} 
        requestId={requestId} 
      />
    </div>
  );
};