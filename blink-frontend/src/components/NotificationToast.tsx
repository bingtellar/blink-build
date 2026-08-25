import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

interface ToastProps {
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
  onClose?: () => void;
}

export const NotificationToast: React.FC<ToastProps> = ({ type, title, message, onClose }) => {
  const styles = {
    success: {
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" aria-hidden="true" />,
      bg: 'bg-emerald-50',
      border: 'border-emerald-100'
    },
    error: {
      icon: <AlertCircle className="w-5 h-5 text-rose-600" aria-hidden="true" />,
      bg: 'bg-rose-50',
      border: 'border-rose-100'
    },
    info: {
      icon: <Info className="w-5 h-5 text-blue-600" aria-hidden="true" />,
      bg: 'bg-blue-50',
      border: 'border-blue-100'
    }
  };

  const currentStyle = styles[type];

  return (
    <div 
      role="alert" 
      aria-live="assertive"
      className="flex items-start w-full max-w-sm p-4 bg-white border border-gray-100 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] pointer-events-auto transition-all duration-300"
    >
      <div className={`flex-shrink-0 p-2 rounded-full ${currentStyle.bg} border ${currentStyle.border}`}>
        {currentStyle.icon}
      </div>
      
      <div className="ml-4 mr-4 flex-1">
        <h3 className="text-sm font-semibold text-gray-900 tracking-tight">
          {title}
        </h3>
        <p className="mt-1 text-sm text-gray-500 leading-relaxed">
          {message}
        </p>
      </div>

      {onClose && (
        <button 
          onClick={onClose}
          aria-label="Close notification"
          className="flex-shrink-0 ml-auto text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-200 rounded-lg p-1 transition-colors"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
};