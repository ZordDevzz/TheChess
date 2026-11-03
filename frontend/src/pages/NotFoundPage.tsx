import React from 'react';
import { useNavigate } from 'react-router-dom';

export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
      <h1 className="text-3xl font-display font-bold text-ink mb-2">404</h1>
      <p className="text-xs text-ink-2 max-w-sm mb-4">
        Trang bạn đang tìm kiếm không tồn tại hoặc đã bị di chuyển.
      </p>
      <button
        type="button"
        onClick={() => navigate('/')}
        className="px-4 py-2 rounded bg-accent text-accent-ink text-xs font-medium cursor-pointer transition hover:opacity-90"
      >
        Về Sảnh chính
      </button>
    </div>
  );
};

export default NotFoundPage;
