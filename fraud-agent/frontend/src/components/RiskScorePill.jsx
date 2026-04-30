import React from 'react';
import { deriveRiskScore01to100, riskScorePillStyle, riskScoreTooltip } from '../utils/riskScoreDisplay.js';

export default function RiskScorePill({ payment, ledgerEntry }) {
  const { score, source } = deriveRiskScore01to100(payment, ledgerEntry);
  const style = riskScorePillStyle(score);

  return (
    <span
      className="ux-risk-pill"
      style={style}
      title={`${riskScoreTooltip(source)} Absolute score: ${score} (scale 1–100, higher is riskier).`}
    >
      <span className="ux-risk-pill__num">{score}</span>
    </span>
  );
}
