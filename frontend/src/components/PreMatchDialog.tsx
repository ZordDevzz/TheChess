import React, { useEffect, useState } from 'react';
import {
  Bot,
  GraduationCap,
  Swords,
  Globe,
  ChevronRight,
} from 'lucide-react';
import {
  AnalysisLevel,
  GameConfig,
  ModePreset,
  PlayerInfo,
} from '../types';
import {
  ANALYSIS_LEVEL_LABELS,
  MODE_PRESETS,
  buildAiPlayerName,
} from '../gameUtils';

interface PreMatchDialogProps {
  open: boolean;
  config: GameConfig;
  players: { w: PlayerInfo; b: PlayerInfo };
  playerColor: 'w' | 'b';
  /** Đã có nước đi chưa (để cảnh báo khi đổi cấu hình giữa ván) */
  hasMoves: boolean;
  onChangeConfig: (config: GameConfig) => void;
  onChangePlayers: (players: { w: PlayerInfo; b: PlayerInfo }) => void;
  onChangePlayerColor: (color: 'w' | 'b') => void;
  onStart: () => void;
  onClose: () => void;
}

const MODE_ICONS: Record<string, React.ReactNode> = {
  training: <GraduationCap className="w-4 h-4" />,
  vs_ai: <Swords className="w-4 h-4" />,
  online: <Globe className="w-4 h-4" />,
};

const MAIA_LEVELS = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900];

/**
 * Màn hình chuẩn bị ván đấu: chọn chế độ, màu, engine đối thủ, tên người chơi,
 * mức phân tích live và các quyền hỗ trợ. Ván chỉ bắt đầu sau khi bấm "Bắt đầu".
 */
export const PreMatchDialog: React.FC<PreMatchDialogProps> = ({
  open,
  config,
  players,
  playerColor,
  hasMoves,
  onChangeConfig,
  onChangePlayers,
  onChangePlayerColor,
  onStart,
  onClose,
}) => {
  const [humanName, setHumanName] = useState(players[playerColor]?.name || 'Player');

  useEffect(() => {
    if (open) setHumanName(players[playerColor]?.name || 'Player');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, playerColor]);

  if (!open) return null;

  const aiSettings = players[playerColor === 'w' ? 'b' : 'w']?.ai ?? {
    engine: 'maia' as const,
    elo: 1500,
  };

  const setAnalysis = (level: AnalysisLevel) => {
    if (config.mode === 'online') return;
    onChangeConfig({ ...config, analysis: level });
  };

  const pickMode = (preset: ModePreset) => {
    if (!preset.enabled) return;
    onChangeConfig({ ...preset.defaultConfig });
  };

  const pickEngine = (engine: 'maia' | 'stockfish', elo?: number) => {
    const nextElo = elo ?? (engine === 'maia' ? 1500 : 1600);
    const ai = { engine, elo: nextElo };
    const opponentSide = playerColor === 'w' ? 'b' : 'w';
    onChangePlayers({
      ...players,
      [opponentSide]: { name: buildAiPlayerName(ai), type: 'ai', ai },
    } as { w: PlayerInfo; b: PlayerInfo });
  };

  const pickElo = (elo: number) => {
    const ai = { ...aiSettings, elo };
    const opponentSide = playerColor === 'w' ? 'b' : 'w';
    onChangePlayers({
      ...players,
      [opponentSide]: { name: buildAiPlayerName(ai), type: 'ai', ai },
    } as { w: PlayerInfo; b: PlayerInfo });
  };

  const commitHumanName = () => {
    const name = humanName.trim() || 'Player';
    onChangePlayers({
      ...players,
      [playerColor]: { name, type: 'human' },
    } as { w: PlayerInfo; b: PlayerInfo });
  };

  return (
    <div className="absolute inset-0 z-30 bg-black/70 backdrop-blur-[3px] flex items-center justify-center p-3">
      <div className="bg-[#141418] border border-zinc-700/80 rounded-xl shadow-2xl w-full max-w-lg max-h-full overflow-y-auto p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">
              Chuẩn bị ván đấu
            </h3>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              {hasMoves
                ? 'Ván cũ chưa hoàn tất — cấu hình lại sẽ giữ nguyên các nước đã đi.'
                : 'Chọn chế độ chơi và đối thủ trước khi bắt đầu.'}
            </p>
          </div>
          {hasMoves && (
            <button
              onClick={onClose}
              className="text-[11px] text-zinc-400 hover:text-zinc-100 cursor-pointer shrink-0"
            >
              Đóng
            </button>
          )}
        </div>

        {/* Chọn chế độ */}
        <div>
          <label className="block text-[11px] text-zinc-400 mb-1.5">
            Chế độ chơi
          </label>
          <div className="grid grid-cols-3 gap-2">
            {MODE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => pickMode(preset)}
                disabled={!preset.enabled}
                className={`p-2.5 rounded-lg border text-left transition relative ${
                  config.mode === preset.id
                    ? 'bg-zinc-800/90 border-zinc-400 text-zinc-100'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-600'
                } ${!preset.enabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <div className="flex items-center gap-1.5 text-zinc-100 font-medium text-[11px]">
                  {MODE_ICONS[preset.id]}
                  {preset.label}
                </div>
                <div className="text-[9px] text-zinc-400 mt-1 leading-snug">
                  {preset.description}
                </div>
                {!preset.enabled && (
                  <span className="absolute -top-1.5 -right-1.5 text-[8px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40">
                    Sắp ra mắt
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Màu quân + tên người chơi */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] text-zinc-400 mb-1.5">
              Quân của bạn
            </label>
            <div className="flex gap-1 bg-zinc-950 p-0.5 rounded border border-zinc-800">
              {(['w', 'b'] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => onChangePlayerColor(c)}
                  className={`flex-1 py-1 rounded text-[11px] font-medium transition cursor-pointer ${
                    playerColor === c
                      ? 'bg-zinc-200 text-zinc-950'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {c === 'w' ? 'Trắng' : 'Đen'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-zinc-400 mb-1.5">
              Tên của bạn
            </label>
            <input
              type="text"
              value={humanName}
              maxLength={24}
              onChange={(e) => setHumanName(e.target.value)}
              onBlur={commitHumanName}
              placeholder="Player"
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-[11px] text-zinc-200 focus:outline-none focus:border-zinc-600"
            />
          </div>
        </div>

        {/* Đối thủ */}
        <div>
          <label className="block text-[11px] text-zinc-400 mb-1.5">
            Đối thủ
          </label>
          <div className="flex gap-1.5 bg-zinc-950 p-0.5 rounded-md border border-zinc-800">
            {(
              [
                ['ai', 'Máy (AI)'],
                ['human', '2 Người'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                onClick={() => {
                  const opponentSide = playerColor === 'w' ? 'b' : 'w';
                  if (val === 'human') {
                    onChangeConfig({ ...config, opponent: 'human' });
                    onChangePlayers({
                      ...players,
                      [opponentSide]: { name: 'Player 2', type: 'human' },
                    } as { w: PlayerInfo; b: PlayerInfo });
                  } else {
                    onChangeConfig({ ...config, opponent: 'ai' });
                    pickEngine(aiSettings.engine, aiSettings.elo);
                  }
                }}
                className={`flex-1 py-1 rounded text-[11px] font-medium transition cursor-pointer ${
                  (config.opponent === 'ai') === (val === 'ai')
                    ? 'bg-zinc-200 text-zinc-950'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Cấu hình engine khi đấu AI */}
        {config.opponent === 'ai' && (
          <div className="space-y-2.5 bg-zinc-950/70 rounded-lg border border-zinc-800/80 p-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => pickEngine('maia', config.mode === 'training' ? 1500 : undefined)}
                className={`p-2 rounded-md border text-left transition cursor-pointer ${
                  aiSettings.engine === 'maia'
                    ? 'bg-zinc-800/90 border-emerald-500/60'
                    : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="font-medium text-zinc-100 text-[11px] flex items-center gap-1">
                  <Bot className="w-3 h-3" /> Maia
                </div>
                <div className="text-[9px] text-zinc-400 mt-0.5">
                  1100–1900
                </div>
              </button>
              <button
                onClick={() => pickEngine('stockfish', 1600)}
                className={`p-2 rounded-md border text-left transition cursor-pointer ${
                  aiSettings.engine === 'stockfish'
                    ? 'bg-zinc-800/90 border-sky-500/60'
                    : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="font-medium text-zinc-100 text-[11px] flex items-center gap-1">
                  <Bot className="w-3 h-3" /> Stockfish
                </div>
                <div className="text-[9px] text-zinc-400 mt-0.5">
                  1320–3190
                </div>
              </button>
            </div>

            {aiSettings.engine === 'maia' ? (
              <div className="grid grid-cols-5 gap-1">
                {MAIA_LEVELS.map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => pickElo(lvl)}
                    className={`py-1 rounded text-[10px] font-mono border transition cursor-pointer ${
                      aiSettings.elo === lvl
                        ? 'bg-zinc-200 border-zinc-200 text-zinc-950 font-semibold'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            ) : (
              <div>
                <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
                  <span>Giới hạn Elo</span>
                  <span className="font-mono text-sky-400 font-semibold">
                    {aiSettings.elo >= 3190 ? 'Tối đa' : aiSettings.elo}
                  </span>
                </div>
                <input
                  type="range"
                  min={1320}
                  max={3190}
                  step={50}
                  value={aiSettings.elo}
                  onChange={(e) => pickElo(Number(e.target.value))}
                  className="w-full accent-zinc-200 cursor-pointer"
                />
              </div>
            )}
          </div>
        )}

        {/* Mức phân tích live */}
        <div>
          <label className="block text-[11px] text-zinc-400 mb-1.5">
            Mức phân tích khi đang chơi
            {config.mode === 'online' && (
              <span className="ml-1.5 text-amber-500/80">
                (khóa ở chế độ Online)
              </span>
            )}
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(ANALYSIS_LEVEL_LABELS) as AnalysisLevel[]).map(
              (lvl) => {
                const active = config.analysis === lvl;
                const locked = config.mode === 'online' && lvl !== 'off';
                return (
                  <button
                    key={lvl}
                    onClick={() => setAnalysis(lvl)}
                    disabled={locked}
                    className={`p-2 rounded-md border text-left transition ${
                      active
                        ? 'bg-zinc-800/90 border-zinc-400'
                        : 'bg-zinc-950 border-zinc-800 hover:border-zinc-600'
                    } ${locked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div className="text-[11px] font-medium text-zinc-100">
                      {ANALYSIS_LEVEL_LABELS[lvl].label}
                    </div>
                    <div className="text-[9px] text-zinc-400 mt-0.5 leading-snug">
                      {ANALYSIS_LEVEL_LABELS[lvl].description}
                    </div>
                  </button>
                );
              }
            )}
          </div>
        </div>

        {/* Toggle hỗ trợ */}
        <div className="grid grid-cols-2 gap-3 text-[11px]">
          <label
            className={`flex items-center justify-between gap-2 cursor-pointer ${
              config.mode === 'online' ? 'opacity-40 pointer-events-none' : ''
            }`}
          >
            <span className="text-zinc-400">Cho phép đi lại nước (takeback)</span>
            <input
              type="checkbox"
              checked={config.allowTakeback}
              onChange={(e) =>
                onChangeConfig({ ...config, allowTakeback: e.target.checked })
              }
              className="accent-zinc-200"
            />
          </label>
          <label
            className={`flex items-center justify-between gap-2 cursor-pointer ${
              config.mode === 'online' ? 'opacity-40 pointer-events-none' : ''
            }`}
          >
            <span className="text-zinc-400">Cho phép gợi ý (hint)</span>
            <input
              type="checkbox"
              checked={config.allowHints}
              onChange={(e) =>
                onChangeConfig({ ...config, allowHints: e.target.checked })
              }
              className="accent-zinc-200"
            />
          </label>
        </div>

        {/* Nút bắt đầu */}
        <button
          onClick={onStart}
          className="w-full py-2.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
        >
          Bắt đầu ván đấu
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
