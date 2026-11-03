import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import { LabScreen } from '../components/LabScreen';

export const LabPage: React.FC = () => {
  const { pushToast } = useToast();
  const navigate = useNavigate();

  return (
    <LabScreen
      onOpenMatch={async (matchId) => {
        navigate(`/match/${matchId}`);
      }}
      onNotify={(msg, kind) => pushToast(msg, kind)}
    />
  );
};

export default LabPage;
