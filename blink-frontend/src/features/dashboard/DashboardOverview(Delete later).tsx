import React from "react";
import {
  LayoutDashboard,
  CreditCard,
  ArrowLeftRight,
  Settings,
  LogOut,
  Plus,
  ArrowUpRight,
  Search,
  Bell,
  TrendingUp,
  ArrowDownLeft,
} from "lucide-react";

// Local Sub-components to keep Dashboard clean
const StatCard = ({ label, value, change }: any) => (
  <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
    <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">
      {label}
    </p>
    <div className="flex items-end gap-2 mt-2">
      <h3 className="text-2xl font-bold tracking-tight">{value}</h3>
      <span className="text-green-500 text-xs font-bold mb-1 flex items-center bg-green-50 px-1.5 py-0.5 rounded">
        <TrendingUp size={12} className="mr-0.5" /> {change}
      </span>
    </div>
  </div>
);

const TransactionItem = ({ name, type, amount, date, status }: any) => (
  <div className="flex items-center justify-between py-4 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 px-2 rounded-xl transition-all cursor-pointer">
    <div className="flex items-center gap-4">
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center ${
          type === "send" ? "bg-gray-100 text-black" : "bg-black text-white"
        }`}
      >
        {type === "send" ? (
          <ArrowUpRight size={18} />
        ) : (
          <ArrowDownLeft size={18} />
        )}
      </div>
      <div>
        <p className="text-sm font-bold text-gray-900">{name}</p>
        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">
          {date}
        </p>
      </div>
    </div>
    <div className="text-right">
      <p
        className={`text-sm font-bold ${
          type === "send" ? "text-gray-900" : "text-green-600"
        }`}
      >
        {type === "send" ? "-" : "+"}
        {amount}
      </p>
      <p className="text-[10px] uppercase font-bold text-gray-400">{status}</p>
    </div>
  </div>
);

export const DashboardOverview = ({
  user,
  onLogout,
}: {
  user: any;
  onLogout: () => void;
}) => {
  return (
    <div className="min-h-screen bg-[#F9F9F8] flex font-sans text-gray-900">
      {/* Sidebar Desktop */}
      <aside className="w-64 bg-white border-r border-gray-100 hidden lg:flex flex-col p-8">
        <div className="mb-12">
          <span className="text-2xl font-bold tracking-tighter">Blink</span>
        </div>
        <nav className="space-y-2 flex-grow">
          <button className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-bold bg-black text-white shadow-lg">
            <LayoutDashboard size={18} /> Overview
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-bold text-gray-400 hover:text-black hover:bg-gray-50">
            <CreditCard size={18} /> My Wallet
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-bold text-gray-400 hover:text-black hover:bg-gray-50">
            <ArrowLeftRight size={18} /> Exchange
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-bold text-gray-400 hover:text-black hover:bg-gray-50">
            <Settings size={18} /> Settings
          </button>
        </nav>
        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-4 py-3.5 text-sm font-bold text-red-500 hover:bg-red-50 rounded-xl"
        >
          <LogOut size={18} /> Logout
        </button>
      </aside>

      {/* Main Dashboard Content */}
      <main className="flex-grow p-4 md:p-10 max-w-6xl mx-auto w-full mb-20 lg:mb-0">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-2xl font-bold">
              Hello, {user.firstName || "User"}
            </h1>
            <p className="text-gray-500 text-sm font-medium">
              Welcome back to Blink.
            </p>
          </div>
          <div className="flex gap-2">
            <button className="p-3 bg-white border border-gray-100 rounded-full shadow-sm hover:border-black transition-all">
              <Search size={20} />
            </button>
            <button className="p-3 bg-white border border-gray-100 rounded-full shadow-sm hover:border-black transition-all relative">
              <Bell size={20} />
              <span className="absolute top-3 right-3 w-2 h-2 bg-black rounded-full border-2 border-white"></span>
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-black rounded-[40px] p-8 md:p-10 text-white relative overflow-hidden shadow-2xl">
              <div className="relative z-10">
                <p className="text-gray-400 text-xs font-bold uppercase tracking-[2px] mb-2">
                  Portfolio Balance
                </p>
                <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-10">
                  $128,430.00
                </h2>
                <div className="flex gap-4">
                  <button className="flex-1 bg-white text-black py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all">
                    <Plus size={18} /> Deposit
                  </button>
                  <button className="flex-1 bg-white/10 backdrop-blur-lg text-white py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-white/20 transition-all">
                    <ArrowUpRight size={18} /> Transfer
                  </button>
                </div>
              </div>
              <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-white/10 rounded-full blur-[80px]"></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <StatCard
                label="Monthly Income"
                value="$14,200.00"
                change="+12.5%"
              />
              <StatCard label="Total Spent" value="$3,105.40" change="-4.2%" />
            </div>
          </div>

          <div className="bg-white rounded-[40px] border border-gray-100 p-8 shadow-sm flex flex-col">
            <div className="flex justify-between items-center mb-8">
              <h3 className="font-bold text-xl">Recent Activity</h3>
              <button className="text-xs font-bold underline hover:opacity-70 transition-all">
                See all
              </button>
            </div>
            <div className="space-y-1">
              <TransactionItem
                name="Apple Store"
                type="send"
                amount="1,299.00"
                date="Today, 12:40 PM"
                status="Completed"
              />
              <TransactionItem
                name="Stripe Payout"
                type="receive"
                amount="4,500.00"
                date="Yesterday"
                status="Completed"
              />
              <TransactionItem
                name="Figma Pro"
                type="send"
                amount="15.00"
                date="Oct 24"
                status="Pending"
              />
              <TransactionItem
                name="Amazon.com"
                type="send"
                amount="84.20"
                date="Oct 22"
                status="Completed"
              />
            </div>
          </div>
        </div>
      </main>

      {/* Mobile Tab Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 flex justify-around lg:hidden z-50">
        {[LayoutDashboard, CreditCard, ArrowLeftRight, Settings].map(
          (Icon, i) => (
            <button
              key={i}
              className={`p-2 ${i === 0 ? "text-black" : "text-gray-300"}`}
            >
              <Icon size={24} />
            </button>
          )
        )}
      </div>
    </div>
  );
};
