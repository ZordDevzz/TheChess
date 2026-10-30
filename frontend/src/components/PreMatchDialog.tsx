import React, { useEffect, useState } from 'react';
import {
  Bot,
  GraduationCap,
  Swords,
  Globe,
  ChevronRight,
  Check,
  SlidersHorizontal,
  RotateCcw,
} from 'lucide-react';
import {
  AnalysisLevel,
  GameConfig,
  ModePreset,
  PlayerInfo,
  PresetPosition,
} from '../types';
import {
  STARTING_FEN,
  ANALYSIS_LEVEL_LABELS,
  MODE_PRESETS,
  buildAiPlayerName,
} from '../gameUtils';

const PRESET_CATEGORY_LABELS: Record<string, string> = {
  Standard: 'Tiêu chuẩn',
  Opening: 'Khai cuộc',
  Endgame: 'Cờ tàn',
  Handicap: 'Chấp quân',
  Tactics: 'Chiến thuật',
};

interface PreMatchDialogProps {
  open: boolean;
  config: GameConfig;
  players: { w: PlayerInfo; b: PlayerInfo };
  playerColor: 'w' | 'b';
  /** FEN xuất phát hiện tại của ván đấu */
  initialFen: string;
  /** Danh sách thế cờ mẫu từ backend */
  presets: PresetPosition[];
  /** Đã có nước đi chưa (để cảnh báo khi đổi cấu hình giữa ván) */
  hasMoves: boolean;
  /** Cho biết Lc0 binary có sẵn hay đang chạy chế độ mô phỏng phân phối người chơi */
  lc0Ready?: boolean;
  onChangeConfig: (config: GameConfig) => void;
  onChangePlayers: (players: { w: PlayerInfo; b: PlayerInfo }) => void;
  onChangePlayerColor: (color: 'w' | 'b') => void;
  onSelectStartingFen: (fen: string) => void;
  onOpenBoardEditor: () => void;
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
  initialFen,
  presets,
  hasMoves,
  lc0Ready,
  onChangeConfig,
  onChangePlayers,
  onChangePlayerColor,
  onSelectStartingFen,
  onOpenBoardEditor,
  onStart,
  onClose,
}) => {
  const [humanName, setHumanName] = useState(
    players[playerColor]?.type === 'human' ? players[playerColor].name : 'Player'
  );

  useEffect(() => {
    if (open) {
      const currentHuman =
        players[playerColor]?.type === 'human'
          ? players[playerColor].name
          : players[playerColor === 'w' ? 'b' : 'w']?.type === 'human'
          ? players[playerColor === 'w' ? 'b' : 'w'].name
          : 'Player';
      setHumanName(currentHuman || 'Player');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, playerColor]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const nonStandardPresets = presets.filter(
    (p) => p.id !== 'standard' && p.fen !== STARTING_FEN
  );
  const matchedPreset = nonStandardPresets.find((p) => p.fen === initialFen);
  const positionType: 'standard' | 'preset' | 'custom' =
    initialFen === STARTING_FEN
      ? 'standard'
      : matchedPreset
      ? 'preset'
      : 'custom';
  const fenSideToMove = initialFen.split(' ')[1] === 'b' ? 'b' : 'w';

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
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="prematch-title"
        className="bg-overlay border border-line-strong rounded-xl shadow-2xl w-full max-w-lg max-h-full overflow-y-auto p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div>
            <h3
              id="prematch-title"
              className="font-display text-base font-semibold text-ink"
            >
              Chuẩn bị ván đấu
            </h3>
            <p className="text-[11px] text-ink-2 mt-0.5">
              {hasMoves
                ? 'Ván cũ chưa hoàn tất — cấu hình lại sẽ giữ nguyên các nước đã đi.'
                : 'Chọn chế độ chơi và đối thủ trước khi bắt đầu.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[11px] text-ink-2 hover:text-ink cursor-pointer shrink-0"
          >
            Đóng
          </button>
        </div>

        {/* Chọn chế độ */}
        <div>
          <label className="block text-[11px] text-ink-2 mb-1.5">
            Chế độ chơi
          </label>
          <div className="grid grid-cols-3 gap-2">
            {MODE_PRESETS.map((preset) => {
              const active = config.mode === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => pickMode(preset)}
                  disabled={!preset.enabled}
                  aria-pressed={active}
                  className={`p-2.5 rounded-lg border text-left transition relative ${
                    active
                      ? 'bg-card border-accent ring-1 ring-accent text-ink shadow-md'
                      : 'bg-inset/70 border-line text-ink-2 opacity-75 hover:opacity-100 hover:border-line-strong'
                  } ${!preset.enabled ? '!opacity-35 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div
                    className={`flex items-center justify-between gap-1 text-[11px] ${
                      active ? 'text-ink font-semibold' : 'text-ink-2 font-medium'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      {MODE_ICONS[preset.id]}
                      {preset.label}
                    </span>
                    {active && (
                      <span className="w-4 h-4 rounded-full bg-accent text-accent-ink flex items-center justify-center shrink-0">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <div
                    className={`text-[10px] mt-1 leading-snug ${
                      active ? 'text-ink-2' : 'text-ink-3'
                    }`}
                  >
                    {preset.description}
                  </div>
                  {!preset.enabled && (
                    <span className="absolute -top-1.5 -right-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40">
                      Sắp ra mắt
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Thế cờ xuất phát */}
        <div>
          <label className="block text-[11px] text-ink-2 mb-1.5">
            Thế cờ xuất phát
          </label>

          <div className="flex gap-1 bg-inset p-1 rounded-md border border-line">
            <button
              type="button"
              aria-pressed={positionType === 'standard'}
              onClick={() => {
                if (positionType !== 'standard') {
                  onSelectStartingFen(STARTING_FEN);
                }
              }}
              className={`flex-1 py-1 rounded text-[11px] transition cursor-pointer ${
                positionType === 'standard'
                  ? 'bg-accent text-accent-ink font-semibold shadow-sm'
                  : 'text-ink-2 hover:text-ink hover:bg-card/60 font-medium'
              }`}
            >
              Tiêu chuẩn
            </button>
            {nonStandardPresets.length > 0 && (
              <button
                type="button"
                aria-pressed={positionType === 'preset'}
                onClick={() => {
                  if (positionType !== 'preset') {
                    onSelectStartingFen(nonStandardPresets[0].fen);
                  }
                }}
                className={`flex-1 py-1 rounded text-[11px] transition cursor-pointer ${
                  positionType === 'preset'
                    ? 'bg-accent text-accent-ink font-semibold shadow-sm'
                    : 'text-ink-2 hover:text-ink hover:bg-card/60 font-medium'
                }`}
              >
                Thế cờ mẫu ({nonStandardPresets.length})
              </button>
            )}
            <button
              type="button"
              aria-pressed={positionType === 'custom'}
              onClick={() => {
                if (positionType !== 'custom') {
                  onOpenBoardEditor();
                }
              }}
              className={`flex-1 py-1 rounded text-[11px] transition cursor-pointer ${
                positionType === 'custom'
                  ? 'bg-accent text-accent-ink font-semibold shadow-sm'
                  : 'text-ink-2 hover:text-ink hover:bg-card/60 font-medium'
              }`}
            >
              {positionType === 'custom' ? 'Tùy chỉnh (FEN)' : 'Tự xếp cờ ↗'}
            </button>
          </div>

          {positionType === 'preset' && matchedPreset && (
            <div className="mt-2 bg-inset rounded-lg border border-line p-2.5 space-y-1.5">
              <select
                value={matchedPreset.id}
                aria-label="Chọn thế cờ mẫu"
                onChange={(e) => {
                  const found = nonStandardPresets.find(
                    (item) => item.id === e.target.value
                  );
                  if (found) onSelectStartingFen(found.fen);
                }}
                className="w-full bg-card border border-line rounded px-2.5 py-1.5 text-[11px] text-ink focus:outline-none focus:border-accent cursor-pointer"
              >
                {nonStandardPresets.map((p) => (
                  <option key={p.id} value={p.id} className="bg-card text-ink">
                    [{PRESET_CATEGORY_LABELS[p.category] || p.category}] {p.name}
                  </option>
                ))}
              </select>
              <div className="flex items-start justify-between gap-2 text-[10px] text-ink-2 leading-snug">
                <span>{matchedPreset.description}</span>
                <span className="shrink-0 font-mono px-1.5 py-0.5 rounded bg-card border border-line text-ink">
                  Lượt: {fenSideToMove === 'w' ? 'Trắng' : 'Đen'}
                </span>
              </div>
            </div>
          )}

          {positionType === 'custom' && (
            <div className="mt-2 bg-inset rounded-lg border border-line p-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono text-ink-2 truncate">
                  FEN: {initialFen}
                </span>
                <span className="shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded bg-card border border-line text-ink">
                  Lượt: {fenSideToMove === 'w' ? 'Trắng' : 'Đen'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={onOpenBoardEditor}
                  className="text-[10px] text-accent hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  Chỉnh sửa trên bàn Xếp cờ
                </button>
                <button
                  type="button"
                  onClick={() => onSelectStartingFen(STARTING_FEN)}
                  className="text-[10px] text-ink-2 hover:text-ink inline-flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  Đặt lại tiêu chuẩn
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Màu quân + tên người chơi */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] text-ink-2 mb-1.5">
              Quân của bạn
            </label>
            <div className="flex gap-1 bg-inset p-1 rounded-md border border-line">
              {(['w', 'b'] as const).map((c) => {
                const active = playerColor === c;
                return (
                  <button
                    key={c}
                    onClick={() => onChangePlayerColor(c)}
                    aria-pressed={active}
                    className={`flex-1 py-1 rounded text-[11px] inline-flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      active
                        ? 'bg-accent text-accent-ink font-semibold shadow-sm'
                        : 'text-ink-2 hover:text-ink hover:bg-card/60 font-medium'
                    }`}
                  >
                    <span
                      className={`w-2.5 h-2.5 rounded-xs border shrink-0 ${
                        c === 'w'
                          ? 'bg-sq-w border-line-strong'
                          : 'bg-sq-b border-line-strong'
                      }`}
                    />
                    {c === 'w' ? 'Trắng' : 'Đen'}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-ink-2 mb-1.5">
              Tên của bạn
            </label>
            <input
              type="text"
              value={humanName}
              maxLength={24}
              onChange={(e) => setHumanName(e.target.value)}
              onBlur={commitHumanName}
              placeholder="Player"
              className="w-full bg-inset border border-line rounded-md px-2.5 py-1.5 text-[11px] text-ink focus:outline-none focus:border-accent"
            />
          </div>
        </div>

        {/* Đối thủ */}
        <div>
          <label className="block text-[11px] text-ink-2 mb-1.5">
            Đối thủ
          </label>
          <div className="flex gap-1.5 bg-inset p-1 rounded-md border border-line">
            {(
              [
                ['ai', 'Máy (AI)'],
                ['human', '2 Người'],
              ] as const
            ).map(([val, label]) => {
              const active = (config.opponent === 'ai') === (val === 'ai');
              return (
                <button
                  key={val}
                  aria-pressed={active}
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
                  className={`flex-1 py-1 rounded text-[11px] transition cursor-pointer ${
                    active
                      ? 'bg-accent text-accent-ink font-semibold shadow-sm'
                      : 'text-ink-2 hover:text-ink hover:bg-card/60 font-medium'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Cấu hình engine khi đấu AI */}
        {config.opponent === 'ai' && (
          <div className="space-y-2.5 bg-inset rounded-lg border border-line p-3">
            <div className="grid grid-cols-2 gap-2">
              {(['maia', 'stockfish'] as const).map((eng) => {
                const active = aiSettings.engine === eng;
                return (
                  <button
                    key={eng}
                    aria-pressed={active}
                    onClick={() =>
                      eng === 'maia'
                        ? pickEngine('maia', config.mode === 'training' ? 1500 : undefined)
                        : pickEngine('stockfish', 1600)
                    }
                    className={`p-2.5 rounded-md border text-left transition cursor-pointer ${
                      active
                        ? 'bg-card border-accent ring-1 ring-accent shadow-sm'
                        : 'bg-inset/70 border-line opacity-75 hover:opacity-100 hover:border-line-strong'
                    }`}
                  >
                    <div
                      className={`text-[11px] flex items-center justify-between gap-1 ${
                        active ? 'font-semibold text-ink' : 'font-medium text-ink-2'
                      }`}
                    >
                      <span className="flex items-center gap-1">
                        <Bot className="w-3.5 h-3.5" />
                        {eng === 'maia' ? 'Maia' : 'Stockfish'}
                      </span>
                      {active && (
                        <span className="w-3.5 h-3.5 rounded-full bg-accent text-accent-ink flex items-center justify-center shrink-0">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </span>
                      )}
                    </div>
                    <div
                      className={`text-[10px] mt-0.5 font-mono ${
                        active ? 'text-ink-2' : 'text-ink-3'
                      }`}
                    >
                      {eng === 'maia'
                        ? `1100–1900 Elo (${lc0Ready ? 'Lc0 Net' : 'Mô phỏng người'})`
                        : '1320–3190 Elo'}
                    </div>
                  </button>
                );
              })}
            </div>

            {aiSettings.engine === 'maia' ? (
              <div className="grid grid-cols-5 gap-1">
                {MAIA_LEVELS.map((lvl) => {
                  const active = aiSettings.elo === lvl;
                  return (
                    <button
                      key={lvl}
                      aria-pressed={active}
                      onClick={() => pickElo(lvl)}
                      className={`py-1 rounded text-[10px] font-mono border transition cursor-pointer ${
                        active
                          ? 'bg-accent border-accent text-accent-ink font-semibold shadow-sm'
                          : 'bg-card/50 border-line text-ink-2 hover:text-ink hover:border-line-strong'
                      }`}
                    >
                      {lvl}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div>
                <div className="flex justify-between text-[10px] text-ink-2 mb-1">
                  <span>Giới hạn Elo</span>
                  <span className="font-mono text-ink font-semibold">
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
                  className="w-full accent-accent cursor-pointer"
                />
              </div>
            )}
          </div>
        )}

        {/* Mức phân tích live */}
        <div>
          <label className="block text-[11px] text-ink-2 mb-1.5">
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
                    aria-pressed={active}
                    onClick={() => setAnalysis(lvl)}
                    disabled={locked}
                    className={`p-2 rounded-md border text-left transition ${
                      active
                        ? 'bg-card border-accent ring-1 ring-accent shadow-sm'
                        : 'bg-inset/70 border-line opacity-75 hover:opacity-100 hover:border-line-strong'
                    } ${locked ? '!opacity-35 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div
                      className={`text-[11px] flex items-center justify-between gap-1 ${
                        active ? 'font-semibold text-ink' : 'font-medium text-ink-2'
                      }`}
                    >
                      <span>{ANALYSIS_LEVEL_LABELS[lvl].label}</span>
                      {active && (
                        <span className="w-3.5 h-3.5 rounded-full bg-accent text-accent-ink flex items-center justify-center shrink-0">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </span>
                      )}
                    </div>
                    <div
                      className={`text-[10px] mt-0.5 leading-snug ${
                        active ? 'text-ink-2' : 'text-ink-3'
                      }`}
                    >
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
            <span className="text-ink-2">Cho phép đi lại nước (takeback)</span>
            <input
              type="checkbox"
              checked={config.allowTakeback}
              onChange={(e) =>
                onChangeConfig({ ...config, allowTakeback: e.target.checked })
              }
              className="accent-accent"
            />
          </label>
          <label
            className={`flex items-center justify-between gap-2 cursor-pointer ${
              config.mode === 'online' ? 'opacity-40 pointer-events-none' : ''
            }`}
          >
            <span className="text-ink-2">Cho phép gợi ý (hint)</span>
            <input
              type="checkbox"
              checked={config.allowHints}
              onChange={(e) =>
                onChangeConfig({ ...config, allowHints: e.target.checked })
              }
              className="accent-accent"
            />
          </label>
        </div>

        {/* Nút bắt đầu */}
        <button
          onClick={() => {
            commitHumanName();
            onStart();
          }}
          className="w-full py-2.5 rounded-lg bg-accent hover:opacity-90 text-accent-ink font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
        >
          Bắt đầu ván đấu
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
