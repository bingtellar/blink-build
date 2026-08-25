// sandbox-1/src/components/DepartmentManagement.tsx
import React, { useState, useEffect } from 'react';
import { getSubAccounts, createSubAccount } from '../services/api'; // 🌟 This fixes your import error
import { PlusIcon, WalletIcon, CopyIcon, CheckIcon } from 'lucide-react';

const DepartmentManagement = ({ userId }: { userId: number }) => {
  const [departments, setDepartments] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    loadDepartments();
  }, [userId]);

  const loadDepartments = async () => {
    try {
      const data = await getSubAccounts(userId);
      setDepartments(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName) return;
    try {
      await createSubAccount(userId, newName);
      setNewName("");
      setIsModalOpen(false);
      loadDepartments(); 
    } catch (err) {
      console.error(err);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Department Ledgers</h1>
            <p className="text-gray-500">Manage Omnibus Virtual Accounts.</p>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg"
          >
            <PlusIcon size={20} /> Add Department
          </button>
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {departments.map((dept) => (
              <div key={dept.id} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex justify-between mb-4">
                  <div className="text-blue-600"><WalletIcon size={24} /></div>
                  <span className="text-xs font-mono text-gray-400">ID: {dept.muxedId.slice(-4)}</span>
                </div>
                <h3 className="font-bold text-gray-900">{dept.name}</h3>
                <p className="text-2xl font-mono text-blue-600 my-2">${dept.balance}</p>
                <div className="bg-gray-50 p-2 rounded text-[10px] break-all border flex items-center gap-2">
                  <code className="flex-1">{dept.muxedAddress}</code>
                  <button onClick={() => copyToClipboard(dept.muxedAddress)}>
                    {copiedId === dept.muxedAddress ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {isModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white p-8 rounded-2xl max-w-md w-full">
              <h2 className="text-xl font-bold mb-4">Create Department</h2>
              <input 
                className="w-full p-3 border rounded-xl mb-4"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name"
              />
              <div className="flex gap-2">
                <button onClick={() => setIsModalOpen(false)} className="flex-1 p-2 border rounded-lg">Cancel</button>
                <button onClick={handleCreate} className="flex-1 p-2 bg-blue-600 text-white rounded-lg">Create</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DepartmentManagement;