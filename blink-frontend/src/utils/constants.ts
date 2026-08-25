export interface FiatCurrency {
  code: string;
  name: string;
  symbol: string;
  rate?: number;
  depositRate: number;    
  withdrawalRate: number; 
  minAmount: number;
  maxAmount: number;
  flagUrl: string;
  bankDetails: {
    bankName: string;
    accountName: string; 
    accountNumber: string;
  };
}

// PRODUCTION FIX 1: Platform Economics & Fees
export const PLATFORM_FEES = {
  cancellation: 1.00, // Fixed 1 USDC penalty for network gas recovery
  creation: 0.00,
};

// NOTE: These rates and bank details act as safe fallbacks. 
// Your live UI should always prioritize the dynamic data fetched from /api/fiat/config.
export const FIAT_CURRENCIES: FiatCurrency[] = [
  // --- MAJOR & WESTERN ---
  { 
    code: "USD", name: "US Dollar", flagUrl: "https://hatscripts.github.io/circle-flags/flags/us.svg", 
    rate: 1, depositRate: 1, withdrawalRate: 1, symbol: "$", 
    bankDetails: { bankName: "Chase Bank", accountName: "Bingtellar Inc", accountNumber: "3920485761" }, 
    minAmount: 10, maxAmount: 100000 
  },
  { 
    code: "EUR", name: "Euro", flagUrl: "https://hatscripts.github.io/circle-flags/flags/eu.svg", 
    rate: 0.92, depositRate: 0.92, withdrawalRate: 0.90, symbol: "€", 
    bankDetails: { bankName: "ClearBank", accountName: "Bingtellar Europe", accountNumber: "EUR12345678" }, 
    minAmount: 10, maxAmount: 100000 
  },
  { 
    code: "GBP", name: "British Pound", flagUrl: "https://hatscripts.github.io/circle-flags/flags/gb.svg", 
    rate: 0.78, depositRate: 0.78, withdrawalRate: 0.76, symbol: "£", 
    bankDetails: { bankName: "ClearBank", accountName: "Bingtellar UK", accountNumber: "GBP12345678" }, 
    minAmount: 10, maxAmount: 100000 
  },

  // --- PAN-AFRICAN ---
  { 
    code: "NGN", name: "Nigerian Naira", flagUrl: "https://hatscripts.github.io/circle-flags/flags/ng.svg", 
    rate: 1401, depositRate: 1401, withdrawalRate: 1390, symbol: "₦", 
    bankDetails: { bankName: "Providus Bank", accountName: "Bingtellar Inc", accountNumber: "8069476419" }, 
    minAmount: 5000, maxAmount: 40000000 
  },
  { 
    code: "KES", name: "Kenyan Shilling", flagUrl: "https://hatscripts.github.io/circle-flags/flags/ke.svg", 
    rate: 130, depositRate: 130, withdrawalRate: 128, symbol: "KSh", 
    bankDetails: { bankName: "Equity Bank", accountName: "Bingtellar Ltd", accountNumber: "1102938475" }, 
    minAmount: 1000, maxAmount: 500000 
  },
  { 
    code: "GHS", name: "Ghanaian Cedi", flagUrl: "https://hatscripts.github.io/circle-flags/flags/gh.svg", 
    rate: 13.5, depositRate: 13.5, withdrawalRate: 13.0, symbol: "GH₵", 
    bankDetails: { bankName: "Ecobank Ghana", accountName: "Bingtellar Ghana", accountNumber: "0011223344" }, 
    minAmount: 100, maxAmount: 100000 
  },
  { 
    code: "ZAR", name: "South African Rand", flagUrl: "https://hatscripts.github.io/circle-flags/flags/za.svg", 
    rate: 18.2, depositRate: 18.2, withdrawalRate: 18.0, symbol: "R", 
    bankDetails: { bankName: "Standard Bank", accountName: "Bingtellar SA", accountNumber: "5544332211" }, 
    minAmount: 100, maxAmount: 1000000 
  },
  { 
    code: "UGX", name: "Ugandan Shilling", flagUrl: "https://hatscripts.github.io/circle-flags/flags/ug.svg", 
    rate: 3800, depositRate: 3800, withdrawalRate: 3750, symbol: "USh", 
    bankDetails: { bankName: "Stanbic Bank Uganda", accountName: "Bingtellar Uganda", accountNumber: "9988776655" }, 
    minAmount: 20000, maxAmount: 10000000 
  },
  { 
    code: "RWF", name: "Rwandan Franc", flagUrl: "https://hatscripts.github.io/circle-flags/flags/rw.svg", 
    rate: 1300, depositRate: 1300, withdrawalRate: 1280, symbol: "FRw", 
    bankDetails: { bankName: "Bank of Kigali", accountName: "Bingtellar Rwanda", accountNumber: "4455667788" }, 
    minAmount: 5000, maxAmount: 5000000 
  },
  { 
    code: "TZS", name: "Tanzanian Shilling", flagUrl: "https://hatscripts.github.io/circle-flags/flags/tz.svg", 
    rate: 2650, depositRate: 2650, withdrawalRate: 2600, symbol: "TSh", 
    bankDetails: { bankName: "CRDB Bank", accountName: "Bingtellar TZ", accountNumber: "01512345678" }, 
    minAmount: 5000, maxAmount: 10000000 
  },
  { 
    code: "XOF", name: "West African CFA", flagUrl: "https://hatscripts.github.io/circle-flags/flags/ci.svg", 
    rate: 605, depositRate: 605, withdrawalRate: 595, symbol: "CFA", 
    bankDetails: { bankName: "Ecobank", accountName: "Bingtellar CI", accountNumber: "123456789" }, 
    minAmount: 1000, maxAmount: 5000000 
  },
  { 
    code: "XAF", name: "Central African CFA", flagUrl: "https://hatscripts.github.io/circle-flags/flags/cm.svg", 
    rate: 605, depositRate: 605, withdrawalRate: 595, symbol: "FCFA", 
    bankDetails: { bankName: "Afriland First Bank", accountName: "Bingtellar CM", accountNumber: "123456789" }, 
    minAmount: 1000, maxAmount: 5000000 
  },
  { 
    code: "EGP", name: "Egyptian Pound", flagUrl: "https://hatscripts.github.io/circle-flags/flags/eg.svg", 
    rate: 48.5, depositRate: 48.5, withdrawalRate: 48.0, symbol: "E£", 
    bankDetails: { bankName: "CIB", accountName: "Bingtellar EG", accountNumber: "123456789" }, 
    minAmount: 500, maxAmount: 500000 
  },
  { 
    code: "CDF", name: "Congolese Franc", flagUrl: "https://hatscripts.github.io/circle-flags/flags/cd.svg", 
    rate: 2850, depositRate: 2850, withdrawalRate: 2800, symbol: "FC", 
    bankDetails: { bankName: "Rawbank", accountName: "Bingtellar CD", accountNumber: "123456789" }, 
    minAmount: 5000, maxAmount: 5000000 
  },
  { 
    code: "ZMW", name: "Zambian Kwacha", flagUrl: "https://hatscripts.github.io/circle-flags/flags/zm.svg", 
    rate: 26, depositRate: 26, withdrawalRate: 25.5, symbol: "ZK", 
    bankDetails: { bankName: "Zanaco", accountName: "Bingtellar ZM", accountNumber: "123456789" }, 
    minAmount: 100, maxAmount: 100000 
  },
  { 
    code: "BWP", name: "Botswana Pula", flagUrl: "https://hatscripts.github.io/circle-flags/flags/bw.svg", 
    rate: 13.5, depositRate: 13.5, withdrawalRate: 13.0, symbol: "P", 
    bankDetails: { bankName: "FNBB", accountName: "Bingtellar BW", accountNumber: "123456789" }, 
    minAmount: 100, maxAmount: 100000 
  },

  // --- ASIAN & GLOBAL ---
  { 
    code: "CNY", name: "Chinese Yuan", flagUrl: "https://hatscripts.github.io/circle-flags/flags/cn.svg", 
    rate: 7.25, depositRate: 7.25, withdrawalRate: 7.15, symbol: "¥", 
    bankDetails: { bankName: "ICBC", accountName: "Bingtellar CN", accountNumber: "123456789" }, 
    minAmount: 100, maxAmount: 500000 
  },
  { 
    code: "AUD", name: "Australian Dollar", flagUrl: "https://hatscripts.github.io/circle-flags/flags/au.svg", 
    rate: 1.52, depositRate: 1.52, withdrawalRate: 1.50, symbol: "A$", 
    bankDetails: { bankName: "CBA", accountName: "Bingtellar AU", accountNumber: "123456789" }, 
    minAmount: 10, maxAmount: 100000 
  },
  { 
    code: "HKD", name: "Hong Kong Dollar", flagUrl: "https://hatscripts.github.io/circle-flags/flags/hk.svg", 
    rate: 7.82, depositRate: 7.82, withdrawalRate: 7.80, symbol: "HK$", 
    bankDetails: { bankName: "HSBC", accountName: "Bingtellar HK", accountNumber: "123456789" }, 
    minAmount: 100, maxAmount: 500000 
  },
  { 
    code: "INR", name: "Indian Rupee", flagUrl: "https://hatscripts.github.io/circle-flags/flags/in.svg", 
    rate: 83.5, depositRate: 83.5, withdrawalRate: 83.0, symbol: "₹", 
    bankDetails: { bankName: "HDFC", accountName: "Bingtellar IN", accountNumber: "123456789" }, 
    minAmount: 500, maxAmount: 1000000 
  },
  { 
    code: "SGD", name: "Singapore Dollar", flagUrl: "https://hatscripts.github.io/circle-flags/flags/sg.svg", 
    rate: 1.35, depositRate: 1.35, withdrawalRate: 1.33, symbol: "S$", 
    bankDetails: { bankName: "DBS", accountName: "Bingtellar SG", accountNumber: "123456789" }, 
    minAmount: 10, maxAmount: 100000 
  },
  { 
    code: "KRW", name: "South Korean Won", flagUrl: "https://hatscripts.github.io/circle-flags/flags/kr.svg", 
    rate: 1380, depositRate: 1380, withdrawalRate: 1370, symbol: "₩", 
    bankDetails: { bankName: "KB Kookmin", accountName: "Bingtellar KR", accountNumber: "123456789" }, 
    minAmount: 10000, maxAmount: 10000000 
  },
  { 
    code: "ARS", name: "Argentine Peso", flagUrl: "https://hatscripts.github.io/circle-flags/flags/ar.svg", 
    rate: 930, depositRate: 930, withdrawalRate: 920, symbol: "$", 
    bankDetails: { bankName: "Banco Nacion", accountName: "Bingtellar AR", accountNumber: "123456789" }, 
    minAmount: 1000, maxAmount: 5000000 
  },
  { 
    code: "AED", name: "UAE Dirham", flagUrl: "https://hatscripts.github.io/circle-flags/flags/ae.svg", 
    rate: 3.67, depositRate: 3.67, withdrawalRate: 3.65, symbol: "AED", 
    bankDetails: { bankName: "Emirates NBD", accountName: "Bingtellar AE", accountNumber: "123456789" }, 
    minAmount: 50, maxAmount: 500000 
  }
];

export const CRYPTO_NETWORKS = [
  { name: "Stellar", icon: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/stellar/info/logo.png" },
  { name: "Base", icon: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png" },
  { name: "Ethereum (ERC 20)", icon: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png" },
  { name: "Solana", icon: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png" },
  { name: "Polygon", icon: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png" },
  { name: "Binance Smart Chain (BEP20)", icon: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png" },
];

// 🌟 PRODUCTION FIX 2: Dynamic Treasury Routing
export const getNetworkDetails = (network: string) => {
  switch (network) {
    case "Stellar": return { 
      address: import.meta.env.VITE_TREASURY_STELLAR || "GBDUOPWKWG263435WXYZ1234567890ABCDEFGH73Y2", 
      memo: import.meta.env.VITE_TREASURY_STELLAR_MEMO || "1029384756" 
    };
    case "Solana": return { 
      address: import.meta.env.VITE_TREASURY_SOLANA || "HN7cABqLq46Es1xyz9Xpqw234567890abcdefghij", 
      memo: null 
    };
    default: return { 
      address: import.meta.env.VITE_TREASURY_EVM || "0x71C7656ec7ab88b098defB751B7401B5f6d8976F", 
      memo: null 
    };
  }
};