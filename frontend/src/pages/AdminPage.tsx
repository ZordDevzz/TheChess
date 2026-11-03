import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { AdminScreen } from '../components/AdminScreen';

export const AdminPage: React.FC = () => {
  const { currentUser, authChecking } = useAuth();
  const { pushToast } = useToast();
  const navigate = useNavigate();

  if (authChecking) {
    return (
      <div className="flex-1 min-h-[300px] flex items-center justify-center text-xs font-mono text-ink-3">
        Đang xác thực quyền truy cập...
      </div>
    );
  }

  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-base font-semibold text-rose-400 mb-2">Quyền truy cập bị từ chối</h2>
        <p className="text-xs text-ink-2 max-w-sm mb-4">
          Trang quản trị chỉ dành riêng cho tài khoản Quản trị viên (Admin).
        </p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="px-3 py-1.5 rounded bg-accent text-accent-ink text-xs font-medium cursor-pointer"
        >
          Về Sảnh chính
        </button>
      </div>
    );
  }

  return (
    <AdminScreen
      currentUser={currentUser}
      onOpenMatch={(matchId) => navigate(`/match/${matchId}`)}
      onNotify={(msg, kind) => pushToast(msg, kind)}
    />
  );
};

export default AdminPage;
