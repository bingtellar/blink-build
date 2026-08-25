import { toast } from 'react-hot-toast';
import { NotificationToast } from '../components/NotificationToast';

export const dispatchDepositToast = (amount: string, txId: string, isDeposit: boolean) => {
  toast.custom((t) => (
    <NotificationToast 
      type="success"
      title={isDeposit ? "Incoming deposit" : "Payment Sent"}
      message={isDeposit 
        ? `$${amount} successfully confirmed and received.` 
        : `Your transfer of $${amount} was successfully delivered.`
      }
      onClose={() => toast.dismiss(t.id)}
    />
  ), { id: `success_${txId}`, duration: 6000 });
};

export const dispatchErrorToast = (txId: string) => {
  toast.custom((t) => (
    <NotificationToast 
      type="error"
      title="Transaction Failed"
      message="The transaction was cancelled and funds were refunded."
      onClose={() => toast.dismiss(t.id)}
    />
  ), { id: `error_${txId}`, duration: 6000 });
};