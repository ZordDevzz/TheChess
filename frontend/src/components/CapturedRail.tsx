import React, { useMemo } from 'react';
import { PieceIcon, PieceCode } from '../theme/pieces';

interface CapturedBarProps {
  /** Bên đã ăn quân (hiển thị quân đối phương bị bắt) */
  side: 'w' | 'b';
  /** Mã quân bị bắt (ví dụ 'bQ'), đã sắp theo giá trị giảm dần */
  symbols: string[];
  /** Chênh lệch vật chất dương nghiêng về bên này */
  diff: number;
  /** Kích thước bàn cờ (px) — suy ra cỡ quân & chiều cao rail */
  boardSize: number;
  /** Vị trí neo trong cột: đáy (cột trái - bottomSide) hay đỉnh (cột phải - topSide) */
  dock?: 'bottom' | 'top';
}

interface PieceStackGroup {
  code: PieceCode;
  count: number;
}

/**
 * Dải quân đối phương đã bị bắt ở 2 bên bàn cờ:
 * - Cột trái (`dock="bottom"`): thuộc về người chơi phía dưới (`bottomSide`), neo đáy và chảy từ dưới lên.
 * - Cột phải (`dock="top"`): thuộc về người chơi phía trên (`topSide`), neo đỉnh và chảy từ trên xuống.
 * - Các quân cùng loại (P, N, B, R, Q) được gom thành từng cụm xếp chồng ngang (stack).
 */
export const CapturedBar: React.FC<CapturedBarProps> = ({
  symbols,
  diff,
  boardSize,
  dock = 'bottom',
}) => {
  const piecePx = Math.max(18, Math.round((boardSize / 8) * 0.38));
  // Khoảng dịch đè giữa các quân cùng loại (~48% chồng lên nhau, lộ rõ đường viền từng quân)
  const overlapPx = Math.round(piecePx * 0.48);
  // Bề rộng rail gọn nhờ cơ chế stack (~8% bàn cờ, giới hạn 44px–54px để ưu tiên diện tích bàn cờ)
  const barWidth = Math.min(54, Math.max(44, Math.round(boardSize * 0.08)));

  const groups = useMemo<PieceStackGroup[]>(() => {
    const out: PieceStackGroup[] = [];
    for (const raw of symbols) {
      const code = raw as PieceCode;
      const last = out[out.length - 1];
      if (last && last.code === code) {
        last.count += 1;
      } else {
        out.push({ code, count: 1 });
      }
    }
    return out;
  }, [symbols]);

  const isTop = dock === 'top';
  // Cột trái (dock bottom) căn phải sát mép bàn; cột phải (dock top) căn trái sát mép bàn
  const alignEdge = isTop ? 'items-start' : 'items-end';
  const justifyRow = isTop ? 'justify-start' : 'justify-end';

  const diffBadge = diff > 0 && (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded bg-inset border border-line font-mono font-semibold text-emerald-400 text-[11px] leading-none shrink-0"
      title={`Lợi thế vật chất +${diff}`}
    >
      +{diff}
    </span>
  );

  return (
    <div
      className={`flex flex-col ${alignEdge} shrink-0 select-none`}
      style={{ width: barWidth, height: boardSize }}
    >
      {/* Nếu neo đáy (cột trái), đẩy toàn bộ nội dung xuống đáy bàn cờ */}
      {!isTop && <div className="flex-1" />}

      {/* Nếu neo đỉnh (cột phải), hiển thị điểm lợi thế ngay sát đỉnh */}
      {isTop && diffBadge && <div className="mb-1.5">{diffBadge}</div>}

      {groups.length > 0 && (
        <div
          className={`flex ${
            isTop ? 'flex-wrap' : 'flex-wrap-reverse'
          } ${justifyRow} items-center gap-x-1.5 gap-y-1 w-full`}
          title="Quân đối phương đã bị bắt"
        >
          {groups.map((g) => (
            <div
              key={g.code}
              className="inline-flex items-center shrink-0"
              title={`${g.count} × ${g.code}`}
            >
              {Array.from({ length: g.count }).map((_, idx) => (
                <span
                  key={idx}
                  className="inline-flex shrink-0 drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]"
                  style={{ marginLeft: idx === 0 ? 0 : -overlapPx }}
                >
                  <PieceIcon code={g.code} size={piecePx} />
                </span>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Nếu neo đáy (cột trái), hiển thị điểm lợi thế ngay sát đáy */}
      {!isTop && diffBadge && <div className="mt-1.5">{diffBadge}</div>}

      {/* Nếu neo đỉnh (cột phải), phần trống dồn xuống dưới */}
      {isTop && <div className="flex-1" />}
    </div>
  );
};

