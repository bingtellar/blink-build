import { useState, useEffect } from "react";
import { 
  Play, Activity, Users, Lock, Server, 
  CheckCircle2, AlertCircle, Sun, Moon 
} from "lucide-react";

const ENDPOINTS = [
  { id: 'health', name: 'Health Check', method: 'GET', path: '/api/health', icon: Activity, body: null, params: [] },
  { id: 'get-users', name: 'List All Users', method: 'GET', path: '/api/users', icon: Users, body: null, params: [] },
  { id: 'create-user', name: 'Create User', method: 'POST', path: '/api/users', icon: Users, params: [], body: '{\n  "walletAddress": "GABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZABC",\n  "email": "tester@bingtellar.com"\n}' },
  { id: 'create-escrow', name: 'Create Escrow', method: 'POST', path: '/api/escrows', icon: Lock, params: [], body: '{\n  "creatorId": 1,\n  "amountLocked": "250.75"\n}' },
  { id: 'get-escrow', name: 'Get Escrow Details', method: 'GET', path: '/api/escrows/:id', icon: Lock, body: null, params: ['id'] },
  { id: 'get-user-escrows', name: 'User Escrow History', method: 'GET', path: '/api/users/:userId/escrows', icon: Users, body: null, params: ['userId'] },
];

export const ApiSandbox = () => {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [activeTab, setActiveTab] = useState(ENDPOINTS[0]);
  const [requestBody, setRequestBody] = useState<string>(ENDPOINTS[0].body || "");
  const [pathParams, setPathParams] = useState<Record<string, string>>({});
  
  const [response, setResponse] = useState<any>(null);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 🛠️ FIX: Sync the browser's body color to prevent the "Black Flash"
  useEffect(() => {
    const bgColor = isDarkMode ? "#0A0A0A" : "#F9FAFB";
    document.body.style.backgroundColor = bgColor;
    // Cleanup on unmount to restore original body color if needed
    return () => { document.body.style.backgroundColor = ""; };
  }, [isDarkMode]);

  const theme = {
    bg: isDarkMode ? "bg-[#0A0A0A]" : "bg-[#F9FAFB]",
    sidebar: isDarkMode ? "bg-[#111] border-[#222]" : "bg-white border-gray-200",
    header: isDarkMode ? "bg-[#111] border-[#222]" : "bg-white border-gray-200",
    text: isDarkMode ? "text-gray-300" : "text-gray-600",
    heading: isDarkMode ? "text-white" : "text-gray-900",
    input: isDarkMode ? "bg-[#111] border-[#333] text-white" : "bg-white border-gray-300 text-gray-900",
    terminal: isDarkMode ? "bg-[#0A0A0A]" : "bg-gray-50",
    border: isDarkMode ? "border-[#222]" : "border-gray-200"
  };

  const handleTabChange = (endpoint: any) => {
    setActiveTab(endpoint);
    setRequestBody(endpoint.body || "");
    setPathParams({});
    setResponse(null);
    setStatusCode(null);
  };

  const handleParamChange = (param: string, value: string) => {
    setPathParams(prev => ({ ...prev, [param]: value }));
  };

  const fireRequest = async () => {
    setIsLoading(true);
    setResponse(null);
    try {
      let finalPath = activeTab.path;
      activeTab.params.forEach(param => {
        const val = pathParams[param] || "1"; 
        finalPath = finalPath.replace(`:${param}`, val);
      });
      const url = `http://localhost:3001${finalPath}`;
      const options: RequestInit = {
        method: activeTab.method,
        headers: { 'Content-Type': 'application/json' },
      };
      if (activeTab.method === 'POST' && requestBody) options.body = requestBody;
      const res = await fetch(url, options);
      const data = await res.json();
      setStatusCode(res.status);
      setResponse(data);
    } catch (error: any) {
      setStatusCode(500);
      setResponse({ error: "Connection Failed. Check Port 3001." });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    // 🛠️ FIX: Added 'transition-all duration-500' for a butter-smooth fade
    <div className={`flex h-screen ${theme.bg} ${theme.text} font-sans transition-all duration-500 ease-in-out`}>
      
      {/* SIDEBAR */}
      <div className={`w-[280px] ${theme.sidebar} border-r flex flex-col transition-all duration-500`}>
        <div className={`p-5 border-b ${theme.border} flex items-center gap-3`}>
          <Server className="text-blue-500" size={20} />
          <h1 className={`font-bold ${theme.heading} tracking-wide text-[15px]`}>BLINK API Sandbox</h1>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {ENDPOINTS.map(ep => {
            const Icon = ep.icon;
            const isActive = activeTab.id === ep.id;
            return (
              <button
                key={ep.id}
                onClick={() => handleTabChange(ep)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-[13px] transition-all ${
                  isActive 
                    ? "bg-blue-500/10 text-blue-500 font-semibold" 
                    : `hover:${isDarkMode ? 'bg-[#222]' : 'bg-gray-100'} text-gray-400`
                }`}
              >
                <Icon size={16} />
                <span className="flex-1">{ep.name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                  ep.method === 'GET' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-amber-500/20 text-amber-400'
                }`}>{ep.method}</span>
              </button>
            );
          })}
        </div>

        <div className={`p-4 border-t ${theme.border}`}>
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`w-full flex items-center justify-center gap-2 py-2 rounded-md text-[12px] font-medium border transition-all ${
              isDarkMode ? 'border-[#333] hover:bg-[#222] text-white' : 'border-gray-300 hover:bg-gray-50 text-gray-700'
            }`}
          >
            {isDarkMode ? <><Sun size={14}/> Light Mode</> : <><Moon size={14}/> Dark Mode</>}
          </button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        
        {/* URL Bar */}
        <div className={`h-[70px] border-b ${theme.header} flex items-center px-6 gap-4 transition-all duration-500`}>
          <div className={`px-3 py-1.5 rounded-md font-mono text-[13px] font-bold ${
            activeTab.method === 'GET' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-amber-500/20 text-amber-400'
          }`}>
            {activeTab.method}
          </div>
          <div className={`flex-1 font-mono text-[14px] ${theme.input} px-4 py-2 rounded-md border tracking-tight transition-all`}>
            http://localhost:3001{activeTab.path}
          </div>
          <button 
            onClick={fireRequest}
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-md font-semibold text-[13px] flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {isLoading ? <Activity className="animate-spin" size={16} /> : <Play size={16} fill="currentColor" />}
            Send Request
          </button>
        </div>

        <div className="flex-1 flex h-full overflow-hidden">
          {/* LEFT: Inputs */}
          <div className={`w-1/2 border-r ${theme.border} flex flex-col transition-all duration-500`}>
            {activeTab.params.length > 0 && (
              <div className={`p-6 border-b ${theme.border}`}>
                <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4">Path Parameters</h3>
                <div className="space-y-4">
                  {activeTab.params.map(param => (
                    <div key={param} className="flex flex-col gap-1.5">
                      <label className="text-[12px] font-mono text-gray-400">{param}</label>
                      <input 
                        type="text"
                        placeholder={`Enter ${param}...`}
                        value={pathParams[param] || ""}
                        onChange={(e) => handleParamChange(param, e.target.value)}
                        className={`rounded-md px-3 py-2 text-[13px] font-mono outline-none focus:ring-1 focus:ring-blue-500 transition-all ${theme.input}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab.method === 'POST' && (
              <div className="flex-1 flex flex-col p-6 overflow-hidden">
                <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4">Request Body (JSON)</h3>
                <textarea 
                  value={requestBody}
                  onChange={(e) => setRequestBody(e.target.value)}
                  className={`flex-1 rounded-md p-4 font-mono text-[13px] outline-none focus:ring-1 focus:ring-blue-500 resize-none transition-all ${theme.input} text-emerald-500`}
                  spellCheck="false"
                />
              </div>
            )}
            
            {activeTab.method === 'GET' && activeTab.params.length === 0 && (
              <div className="flex-1 flex items-center justify-center text-gray-500 font-mono text-[13px]">
                No payload required.
              </div>
            )}
          </div>

          {/* RIGHT: Response Terminal */}
          <div className={`w-1/2 flex flex-col ${theme.terminal} transition-all duration-500`}>
            <div className={`h-[40px] border-b ${theme.border} flex items-center justify-between px-6 transition-all duration-500`}>
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Server Response</span>
              {statusCode && (
                <div className={`flex items-center gap-1.5 text-[12px] font-mono font-bold ${statusCode >= 200 && statusCode < 300 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {statusCode >= 200 && statusCode < 300 ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                  Status: {statusCode}
                </div>
              )}
            </div>
            <div className="flex-1 p-6 overflow-auto">
              {response ? (
                <pre className={`font-mono text-[13px] leading-relaxed ${isDarkMode ? 'text-gray-300' : 'text-gray-800'}`}>
                  {JSON.stringify(response, null, 2)}
                </pre>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-40 space-y-3">
                  <Server size={32} />
                  <p className="text-[12px] font-mono uppercase tracking-widest">Ready for request</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiSandbox;