import React, { useState } from "react";
import { 
  ShieldCheck, 
  Lock, 
  MoreHorizontal, 
  Wallet, 
  Code,
  Info,
  XCircle,
  Eye,       
  EyeOff,
  Loader2    // <-- Imported loading spinner
} from "lucide-react";

export const Settings = () => {
  const [emailToggle, setEmailToggle] = useState(true);
  
  // Modal States
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  // Visibility & Loading States
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false); // <-- New loading state
  
  // Error States
  const [passwordError, setPasswordError] = useState("");
  const [confirmError, setConfirmError] = useState("");

  const closePasswordModal = () => {
    setIsPasswordModalOpen(false);
    setPassword("");
    setConfirmPassword("");
    setPasswordError("");
    setConfirmError("");
    setShowPassword(false);         
    setShowConfirmPassword(false);  
    setIsLoading(false);            // <-- Reset loading on close
  };

  const handleUpdatePassword = () => {
    let isValid = true;
    setPasswordError("");
    setConfirmError("");

    // Regex Checks
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+/.test(password);

    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      isValid = false;
    } else if (!hasUpperCase || !hasLowerCase) {
      setPasswordError("Must contain uppercase and lowercase letters");
      isValid = false;
    } else if (!hasNumber || !hasSpecialChar) {
      setPasswordError("Must contain a number and a special character");
      isValid = false;
    }

    if (password !== confirmPassword) {
      setConfirmError("Passwords do not match");
      isValid = false;
    }

    if (isValid) {
      // Start the loading state
      setIsLoading(true);
      
      // Simulate an API call with a 1.5 second delay
      setTimeout(() => {
        console.log("Password updated successfully!");
        setIsLoading(false);
        closePasswordModal();
      }, 1500);
    }
  };

  return (
    <>
      <div className="w-full h-full bg-white flex flex-col pt-4 px-8 sm:px-12 pb-12 animate-in fade-in duration-300">
        <div className="max-w-[720px] w-full">
          
          {/* HEADER */}
          <div className="mb-8">
            <h1 className="text-[18px] font-semibold text-[#1A1A1A]">Account settings</h1>
          </div>

          {/* SECURITY SECTION */}
          <div className="mb-8">
            <h3 className="text-[13px] font-semibold text-[#1A1A1A] mb-3">Security</h3>
            <div className="bg-white border border-[#F0F0EF] rounded-[16px] overflow-hidden">
              <button className="w-full flex items-center gap-3 p-4 hover:bg-[#F9F9F9] transition-colors border-b border-[#F0F0EF] text-left">
                <div className="w-7 h-7 flex items-center justify-center bg-[#1A1A1A] rounded-full shrink-0">
                  <ShieldCheck size={14} className="text-white" />
                </div>
                <span className="text-[13px] font-medium text-[#1A1A1A]">Wallet security</span>
              </button>
              <button className="w-full flex items-center gap-3 p-4 hover:bg-[#F9F9F9] transition-colors text-left">
                <div className="w-7 h-7 flex items-center justify-center bg-[#1A1A1A] rounded-full shrink-0">
                  <Lock size={14} className="text-white" />
                </div>
                <span className="text-[13px] font-medium text-[#1A1A1A]">Two-step authentication</span>
              </button>
            </div>
          </div>

          {/* PASSWORD MANAGER SECTION */}
          <div className="mb-8">
            <h3 className="text-[13px] font-semibold text-[#1A1A1A] mb-3">Password manager</h3>
            <div className="bg-white border border-[#F0F0EF] rounded-[16px] overflow-hidden">
              <button 
                onClick={() => setIsPasswordModalOpen(true)}
                className="w-full flex items-center gap-3 p-4 hover:bg-[#F9F9F9] transition-colors text-left"
              >
                <div className="w-7 h-7 flex items-center justify-center bg-[#1A1A1A] rounded-full shrink-0">
                  <MoreHorizontal size={14} className="text-white" />
                </div>
                <span className="text-[13px] font-medium text-[#1A1A1A]">Setup or change password</span>
              </button>
            </div>
          </div>

          {/* WALLET MANAGER SECTION */}
          <div className="mb-8">
            <h3 className="text-[13px] font-semibold text-[#1A1A1A] mb-3">Wallet manager</h3>
            <div className="bg-white border border-[#F0F0EF] rounded-[16px] overflow-hidden">
              <button className="w-full flex items-center gap-3 p-4 hover:bg-[#F9F9F9] transition-colors text-left">
                <div className="w-7 h-7 flex items-center justify-center bg-[#1A1A1A] rounded-full shrink-0">
                  <Wallet size={14} className="text-white" />
                </div>
                <span className="text-[13px] font-medium text-[#1A1A1A]">Manage the wallets connected to this account</span>
              </button>
            </div>
          </div>

          {/* DEVELOPER SECTION */}
          <div className="mb-8">
            <h3 className="text-[13px] font-semibold text-[#1A1A1A] mb-3">Developer</h3>
            <div className="bg-white border border-[#F0F0EF] rounded-[16px] overflow-hidden">
              <button className="w-full flex items-center gap-3 p-4 hover:bg-[#F9F9F9] transition-colors text-left">
                <div className="w-7 h-7 flex items-center justify-center bg-[#1A1A1A] rounded-full shrink-0">
                  <Code size={14} className="text-white" />
                </div>
                <span className="text-[13px] font-medium text-[#1A1A1A]">Generate API Key</span>
              </button>
            </div>
          </div>

          {/* EMAIL SETTINGS SECTION */}
          <div className="mb-8">
            <h3 className="text-[13px] font-semibold text-[#1A1A1A] mb-3">Email Settings</h3>
            <div className="bg-white border border-[#F0F0EF] rounded-[16px] p-5">
              <p className="text-[12px] text-[#757575] mb-5">
                Configure your email notification preferences for your account.
              </p>
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-[#1A1A1A]">Weekly Earnings Report</span>
                
                {/* FUNCTIONAL TOGGLE BUTTON */}
                <button 
                  onClick={() => setEmailToggle(!emailToggle)}
                  className={`w-10 h-5 rounded-full flex items-center transition-colors duration-300 ease-in-out px-1 focus:outline-none ${
                    emailToggle ? "bg-[#34A853]" : "bg-gray-200"
                  }`}
                >
                  <div 
                    className={`w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-transform duration-300 ease-in-out ${
                      emailToggle ? "translate-x-4" : "translate-x-0"
                    }`} 
                  />
                </button>

              </div>
            </div>
          </div>

        </div>
      </div>

      {/* PASSWORD SETUP MODAL */}
      {isPasswordModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-300"
            onClick={closePasswordModal}
          />
          
          {/* Modal Container */}
          <div className="relative w-full max-w-[440px] m-auto bg-white rounded-[24px] shadow-2xl flex flex-col p-8 animate-in zoom-in-95 duration-300 text-center">
            
            {/* Top Badge Icon */}
            <div className="mx-auto w-12 h-8 bg-[#F5F5F4] rounded-lg flex items-center justify-center mb-6">
              <span className="text-[#A3A3A3] font-black text-[18px] mt-2.5 leading-none">***</span>
            </div>

            {/* Headers */}
            <h2 className="text-[20px] font-bold text-[#1A1A1A] mb-2">Upgrade Your Account Password</h2>
            <p className="text-[13px] text-[#757575] mb-8 leading-relaxed px-4">
              Set up a password to enhance your account security and streamline your login process.
            </p>

            {/* Form Inputs */}
            <div className="text-left space-y-4 mb-6">
              
              {/* Enter New Password */}
              <div>
                <div className="relative">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    placeholder="Enter new password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (passwordError) setPasswordError("");
                    }}
                    className={`w-full border ${passwordError ? 'border-red-400 focus:border-red-500' : 'border-[#E8E8E8] focus:border-black'} rounded-xl pl-4 pr-10 py-3.5 text-[13px] outline-none transition-colors`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A3A3A3] hover:text-[#1A1A1A] transition-colors p-1"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {passwordError && (
                  <div className="flex items-center gap-1.5 text-red-500 mt-2">
                    <XCircle size={14} className="fill-red-500 text-white shrink-0" />
                    <span className="text-[12px]">{passwordError}</span>
                  </div>
                )}
              </div>

              {/* Confirm New Password */}
              <div>
                <div className="relative">
                  <input 
                    type={showConfirmPassword ? "text" : "password"} 
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (confirmError) setConfirmError("");
                    }}
                    className={`w-full border ${confirmError ? 'border-red-400 focus:border-red-500' : 'border-[#E8E8E8] focus:border-black'} rounded-xl pl-4 pr-10 py-3.5 text-[13px] outline-none transition-colors`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A3A3A3] hover:text-[#1A1A1A] transition-colors p-1"
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {confirmError && (
                  <div className="flex items-center gap-1.5 text-red-500 mt-2">
                    <XCircle size={14} className="fill-red-500 text-white shrink-0" />
                    <span className="text-[12px]">{confirmError}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Requirements Box */}
            <div className="bg-[#F9F9F9] border border-[#F0F0EF] rounded-xl p-5 text-left mb-8 flex gap-3">
              <Info size={16} className="fill-[#A3A3A3] text-white shrink-0 mt-0.5" />
              <div>
                <h4 className="text-[13px] font-bold text-[#1A1A1A] mb-2">Password Requirements:</h4>
                <ul className="text-[12px] text-[#1A1A1A] space-y-1 ml-4 list-disc marker:text-[#1A1A1A]">
                  <li>At least 8 characters long</li>
                  <li>One uppercase and one lowercase letter</li>
                  <li>One number and one special character</li>
                </ul>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4">
              <button 
                onClick={closePasswordModal}
                disabled={isLoading}
                className="flex-1 py-3.5 rounded-xl border border-[#E8E8E8] text-[13px] font-bold text-[#1A1A1A] hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Maybe Later
              </button>
              
              {/* --- UPDATED BUTTON WITH LOADING SPINNER --- */}
              <button 
                onClick={handleUpdatePassword}
                disabled={isLoading}
                className="flex-1 py-3.5 flex items-center justify-center gap-2 rounded-xl bg-black text-white text-[13px] font-bold hover:bg-gray-800 transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isLoading && <Loader2 size={16} className="animate-spin" />}
                {isLoading ? "Updating..." : "Update password"}
              </button>

            </div>

          </div>
        </div>
      )}
    </>
  );
};