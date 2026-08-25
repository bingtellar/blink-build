import React, { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import {
  LayoutGrid,
  Wallet,
  ArrowLeftRight,
  Send,
  Users,
  Settings,
  HelpCircle,
  ChevronsUpDown, 
  User,
  SlidersHorizontal,
  Menu,
  X,
  PlusCircle,    
  LogOut,
  CheckCircle2,
  TextSearch,
  MessageSquareMore
} from "lucide-react";

// Import the global store
import { useStore } from "../../store/useStore";

export interface AccountData {
  id: string | number;
  alias: string;
  name: string;
  businessName: string;
  type: string;
  balance: number;
  isReady: boolean;
  isActive: boolean;
  muxedAddress?: string; 
  muxedId?: string;      
}

interface LayoutProps {
  children: React.ReactNode;
  onProfileClick?: () => void; 
  onLogout?: () => void; 
  onSeeAllAccounts?: () => void;
  onCreateAccount?: () => void;
  onOpenCopilot?: () => void;
  accounts: AccountData[]; 
  activeAccount: AccountData | null;
  onAccountSwitch: (account: AccountData) => void;
}

export const DashboardLayout = ({
  children,
  onProfileClick, 
  onLogout,
  onSeeAllAccounts,
  onCreateAccount,
  accounts, 
  activeAccount,
  onAccountSwitch,
  onOpenCopilot
}: LayoutProps) => {
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState(false);

  // Connect the layout to the global Radar state
  const isRadarOpen = useStore((state) => state.isRadarOpen);
  const radarLayoutMode = useStore((state) => state.radarLayoutMode);

  const safeAccounts = Array.isArray(accounts) ? accounts : [];

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) setIsMobileMenuOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const getInitials = (name: string) => {
    if (!name) return "??";
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  };


  const handleLogoutClick = () => {
    setIsAccountDropdownOpen(false);
    if (onLogout) {
      onLogout(); 
      navigate("/login", { replace: true });
    } else {
      navigate("/login");
    }
  };

  const activeAccountName = activeAccount 
    ? (activeAccount.businessName || activeAccount.alias || activeAccount.name) 
    : "Loading Account...";

  const isActiveAccountMaster = !activeAccount?.muxedId || activeAccount?.muxedId === 'MASTER_WALLET';

  const checkIsReady = (acc: any, isMaster: boolean) => {
    if (!acc) return false;
    if (acc.isReady === true || String(acc.isReady) === "true") return true;
    if (acc.balance !== undefined && parseFloat(acc.balance) > 0) return true;
    if (!isMaster) return true; 
    if (isMaster && safeAccounts.length > 1) return true; 
    return false;
  };

  const isActiveAccountReady = checkIsReady(activeAccount, isActiveAccountMaster);

  return (
    <div className="flex h-screen bg-[#F5F4F0] text-[#1A1A1A] font-sans antialiased overflow-hidden">
      <aside className={`fixed inset-y-0 left-0 z-50 w-[280px] bg-[#F5F4F0] transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 lg:shadow-none ${isMobileMenuOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"} flex flex-col px-10 py-12 flex-shrink-0`}>
        <div className="flex justify-between items-center mb-8">
          <div className="text-[24px] font-bold tracking-tight cursor-pointer" onClick={() => navigate("/dashboard")}>Blink</div>
          <button className="lg:hidden" onClick={() => setIsMobileMenuOpen(false)}><X size={24} /></button>
        </div>

        <div className="relative mb-8 z-[60] h-[62px]">
          {isAccountDropdownOpen && <div className="fixed inset-0 z-40" onClick={() => setIsAccountDropdownOpen(false)} />}
          
          <div className={`absolute top-0 left-0 bg-white border transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden z-50 ${isAccountDropdownOpen ? 'w-[260px] max-h-[600px] border-[#E8E7E1] rounded-[24px] shadow-[0px_12px_40px_rgba(0,0,0,0.12)]' : 'w-full max-h-[62px] border-[#E8E7E1] rounded-[24px] hover:border-[#D1D1D1]'}`}>
            
            <div onClick={() => setIsAccountDropdownOpen(!isAccountDropdownOpen)} className={`h-[60px] pl-2.5 pr-4 flex items-center justify-between cursor-pointer transition-colors duration-300 shrink-0 ${isAccountDropdownOpen ? 'bg-[#F9F9F8]/50 border-b border-[#E8E7E1]' : 'bg-white'}`}>
              {/* 🌟 FIX: Added min-w-0 and flex-1 to allow dynamic truncation without pushing the chevron */}
              <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                <div className={`w-10 h-10 border rounded-full flex items-center justify-center font-semibold text-[15px] shrink-0 ${isActiveAccountMaster ? 'bg-black text-white border-black' : 'bg-[#E5E5E3] text-[#1A1A1A] border-[#1A1A1A]'}`}>
                  {activeAccount ? getInitials(activeAccountName).charAt(0) : "?"}
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  {/* 🌟 UX FIX: Smart length-based truncation. Full name if it fits (< 14 chars), First name if it doesn't. */}
                  <div className="text-[15px] font-bold leading-tight truncate">
                    {activeAccountName.length > 13 ? activeAccountName.split(' ')[0] : activeAccountName}
                  </div>
                  <span className={`text-[13px] font-medium mt-0.5 truncate ${isActiveAccountReady ? 'text-[#8B8B8B]' : 'text-[#F59E0B]'}`}>
                    {isActiveAccountReady ? "Ready" : "Setup"}
                  </span>
                </div>
              </div>
              <ChevronsUpDown size={18} className="text-[#8B8B8B] shrink-0" />
            </div>

            {isAccountDropdownOpen && (
              <div className="px-5 pt-4 pb-5 animate-in fade-in duration-300">
                {activeAccount && (
                  <div className="mb-4">
                    <h3 className="text-[16px] font-bold text-[#1A1A1A] truncate">{activeAccountName}</h3>
                    <p className="text-[13px] text-[#8B8B8B] mt-0.5 truncate">{activeAccount.name}</p>
                  </div>
                )}
                <div className="h-[1px] bg-[#E8E7E1] w-full mb-4" />
                
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[11px] font-bold text-[#8B8B8B] tracking-widest uppercase">Accounts</span>
                  <button 
                    onClick={() => {
                      setIsAccountDropdownOpen(false);
                      if (onSeeAllAccounts) onSeeAllAccounts();
                    }} 
                    className="text-[12px] font-bold text-[#3B82F6] hover:underline"
                  >
                    See all
                  </button>
                </div>

                <div className="space-y-2 mb-4 max-h-[200px] overflow-y-auto custom-scrollbar">
                  {safeAccounts.length === 0 ? (
                     <div className="text-[12px] text-gray-400 py-2">Loading...</div>
                  ) : (
                    /* 🌟 THE FIX: filter(Boolean) protects against corrupted null items! */
                    safeAccounts.filter(Boolean).map((acc) => {
                      const isMasterAccountInList = !acc.muxedId || acc.muxedId === 'MASTER_WALLET';
                      
                      const isCurrentlyActive = 
                        activeAccount && 
                        String(activeAccount.id) === String(acc.id) && 
                        (isMasterAccountInList ? isActiveAccountMaster : activeAccount.muxedId === acc.muxedId);

                      const displayIsReady = checkIsReady(acc, isMasterAccountInList);
                      
                      return (
                        <div 
                          key={`drop-${acc.muxedId || 'new'}-${acc.id}`} 
                          onClick={() => {
                            onAccountSwitch(acc);
                            setIsAccountDropdownOpen(false);
                          }} 
                          className={`rounded-[16px] p-3 flex items-center justify-between cursor-pointer transition-colors border ${
                            isCurrentlyActive 
                              ? 'bg-[#F9F9F8] border-[#E8E7E1]' 
                              : 'bg-white border-transparent hover:bg-gray-50'
                          }`}
                        >
                          {/* 🌟 FIX: Applied the same strict flex boundaries to the sub-items */}
                          <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0 ${isMasterAccountInList ? 'bg-black text-white' : 'bg-[#E5E5E3] text-[#1A1A1A]'}`}>
                              {getInitials(acc.businessName || acc.name)}
                            </div>
                            <div className="flex flex-col min-w-0 flex-1 text-left">
                              <p className="text-[13px] font-bold text-[#1A1A1A] truncate">{acc.businessName || acc.alias}</p>
                              <p className={`text-[11px] font-medium truncate ${displayIsReady ? 'text-[#8B8B8B]' : 'text-[#F59E0B]'}`}>
                                {displayIsReady ? "Ready" : "Setup"}
                              </p>
                            </div>
                          </div>
                          {isCurrentlyActive && <CheckCircle2 size={16} className="text-green-500 shrink-0" />}
                        </div>
                      );
                    })
                  )}
                </div>
               
                <div className="space-y-3.5 mt-2">
                  <button 
                    onClick={() => {
                      setIsAccountDropdownOpen(false);
                      if (onCreateAccount) onCreateAccount();
                    }} 
                    className="flex items-center gap-3 w-full text-[14px] font-bold text-[#1A1A1A] group"
                  >
                    <PlusCircle size={18} className="text-[#1A1A1A]" strokeWidth={2} />
                    <span>Create sub-account</span>
                  </button>
                  <button onClick={() => { setIsAccountDropdownOpen(false); navigate("/dashboard/settings"); }} className="flex items-center gap-3 w-full text-[14px] font-bold text-[#1A1A1A] group hover:opacity-80 transition-opacity">
                    <Settings size={18} className="text-[#1A1A1A]" strokeWidth={2} />
                    <span>Account settings</span>
                  </button>
                </div>
                <div className="h-[1px] bg-[#E8E7E1] w-full my-4" />
                <button onClick={handleLogoutClick} className="text-[14px] font-bold text-[#FF4D4D] hover:opacity-80 transition-opacity flex items-center gap-3 w-full">
                  <LogOut size={18} className="text-[#FF4D4D]" strokeWidth={2} /> Log out
                </button>
              </div>
            )}
          </div>
        </div>

        <nav className="flex-grow space-y-6">
  {[
    { id: "", label: "Dashboard", icon: LayoutGrid },
    { id: "balance", label: "Balance", icon: Wallet },
    { id: "transactions", label: "Transactions", icon: ArrowLeftRight },
    { id: "payments", label: "Payments", icon: Send },
    { id: "recipients", label: "Recipients", icon: Users },
    { id: "radar", label: "Radar", icon: TextSearch },
  ].map((item) => (
    <NavLink 
      key={item.label} 
      to={`/dashboard${item.id ? `/${item.id}` : ""}`}
      end={item.id === ""} 
      onClick={() => setIsMobileMenuOpen(false)}
      className={({ isActive }) => 
        `w-full flex items-center gap-4 text-[15px] font-bold transition-all ${
          isActive ? "opacity-100" : "opacity-40 hover:opacity-100"
        }`
      }
    >
      <item.icon size={20} strokeWidth={2.5} /> {item.label}
    </NavLink>
  ))}
</nav>

        {/* 🌟 UNIFORM BOTTOM MENU */}
        <div className="mt-auto space-y-6 text-[15px] font-bold">
          
          <button 
            onClick={onOpenCopilot}
            className="w-full flex items-center gap-4 transition-all opacity-40 hover:opacity-100 group"
          >
            <div className="relative">
              <MessageSquareMore size={20} strokeWidth={2.5} className="group-hover:text-black-500 transition-colors" />
              <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-black-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-gray-500 border border-[#F5F4F0]"></span>
              </span>
            </div>
            Ask Copilot
          </button>

          {/* 🌟 FIX: Made Settings a NavLink and removed handleNavClick */}
          <NavLink 
            to="/dashboard/settings"
            onClick={() => setIsMobileMenuOpen(false)}
            className={({ isActive }) => `w-full flex items-center gap-4 transition-opacity ${isActive ? "opacity-100" : "opacity-40 hover:opacity-100"}`}
          >
            <Settings size={20} strokeWidth={2.5} /> Settings
          </NavLink>
          
          <button className="w-full flex items-center gap-4 opacity-40 hover:opacity-100 transition-opacity">
            <HelpCircle size={20} strokeWidth={2.5} /> Get help
          </button>
          
        </div>
      </aside>

      {/* 🌟 STRIPE LIKE ADAPTIVE ENGINE */}
      {/* Dashboard ONLY shrinks when FLOATING mode is active. Sidebar acts as a normal overlay. */}
      <main className={`flex-1 lg:pt-6 flex flex-col overflow-hidden relative transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
        isRadarOpen && radarLayoutMode === 'floating' ? 'lg:mr-[406px] lg:pr-0' : 'mr-0 lg:pr-6'
      }`}>
        <div className="flex-1 bg-white lg:rounded-t-[32px] border-t border-l border-r border-[#E8E7E1] flex flex-col overflow-hidden shadow-sm">
          
          <div className="flex justify-between items-center px-6 lg:px-12 py-6 lg:py-8 flex-shrink-0">
            <div className="flex items-center gap-4">
              <button className="lg:hidden" onClick={() => setIsMobileMenuOpen(true)}>
                <Menu size={24} />
              </button>
              <SlidersHorizontal size={20} className="opacity-40 cursor-pointer hidden lg:block" />
            </div>
            <div onClick={onProfileClick} className="w-10 h-10 bg-[#E5E5E3] hover:bg-[#D1D1D1] transition-colors rounded-full flex items-center justify-center cursor-pointer">
              <User size={20} className="text-gray-600" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 lg:px-12 pb-16">
            <div className="max-w-[1000px] mx-auto">{children}</div>
          </div>

        </div>
        
        {isMobileMenuOpen && <div className="fixed inset-0 bg-black/20 z-40 lg:hidden" onClick={() => setIsMobileMenuOpen(false)} />}
      </main>
    </div>
  );
};