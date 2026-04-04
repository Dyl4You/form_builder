const LEVEL_THRESHOLDS = [0, 120, 260, 430, 640, 900, 1210, 1570, 1980, 2440];

const ACHIEVEMENTS = {
  starter_architect: {
    title: 'Starter Architect',
    description: 'Save 5 templates.'
  },
  palette_polyglot_i: {
    title: 'Palette Polyglot I',
    description: 'Use 6+ unique component types in one template.'
  },
  palette_polyglot_ii: {
    title: 'Palette Polyglot II',
    description: 'Use 10+ unique component types in one template.'
  },
  balance_master: {
    title: 'Balance Master',
    description: 'Keep dominant type <= 40% with at least 12 components.'
  },
  conditional_weaver: {
    title: 'Conditional Weaver',
    description: 'Use at least 5 conditional rules in one template.'
  },
  grid_commander: {
    title: 'Grid Commander',
    description: 'Use both Edit Grid and Data Grid in one template.'
  },
  handcrafted_run: {
    title: 'Handcrafted Run',
    description: 'Reach 3 consecutive saves with no AI actions.'
  },
  neglected_revival: {
    title: 'Neglected Revival',
    description: 'Use least-used component types in 5 saves.'
  }
};

function toInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function sumByObject(obj) {
  if (!obj || typeof obj !== 'object') return 0;
  return Object.values(obj).reduce((acc, value) => acc + toInt(value), 0);
}

function normalizeTelemetry(telemetry = {}) {
  const manualAddsByType = (telemetry.manualAddsByType && typeof telemetry.manualAddsByType === 'object')
    ? telemetry.manualAddsByType
    : {};

  const manualAdds = sumByObject(manualAddsByType);
  const manualEdits = toInt(telemetry.manualEdits);
  const manualDeletes = toInt(telemetry.manualDeletes);
  const aiAdds = toInt(telemetry.aiAdds);
  const aiEdits = toInt(telemetry.aiEdits);
  const aiDeletes = toInt(telemetry.aiDeletes);

  const manualActions = manualAdds + manualEdits + manualDeletes;
  const aiActions = aiAdds + aiEdits + aiDeletes;

  return {
    sessionElapsedMs: toInt(telemetry.sessionElapsedMs),
    manualAddsByType,
    manualAdds,
    manualEdits,
    manualDeletes,
    aiAdds,
    aiEdits,
    aiDeletes,
    manualActions,
    aiActions
  };
}

function clampScore(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

function computeMasteryScores(metrics, telemetry) {
  const actionCounts = normalizeTelemetry(telemetry);
  const manualActions = actionCounts.manualActions;
  const aiActions = actionCounts.aiActions;

  const diversityScore = clampScore((metrics.uniqueTypes / 10) * 100);
  const balanceScore = clampScore((1 - (metrics.dominantTypeShare || 0)) * 100);
  const complexityScore = clampScore((20 * metrics.maxDepth) + (8 * metrics.advancedFeatureCount));
  const craftScore = clampScore((manualActions / Math.max(1, manualActions + aiActions)) * 100);

  const masteryScore = clampScore(
    (0.35 * diversityScore) +
    (0.25 * balanceScore) +
    (0.25 * complexityScore) +
    (0.15 * craftScore)
  );

  return {
    diversityScore,
    balanceScore,
    complexityScore,
    craftScore,
    masteryScore,
    actionCounts
  };
}

function thresholdForLevel(level) {
  const safeLevel = Math.max(1, toInt(level) || 1);
  if (safeLevel <= LEVEL_THRESHOLDS.length) {
    return LEVEL_THRESHOLDS[safeLevel - 1];
  }
  return LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1] + ((safeLevel - LEVEL_THRESHOLDS.length) * 500);
}

function levelFromXp(xpTotal) {
  const xp = Math.max(0, Number(xpTotal) || 0);
  let level = 1;

  while (thresholdForLevel(level + 1) <= xp) {
    level += 1;
  }

  return level;
}

function nextLevelXp(level) {
  return thresholdForLevel((toInt(level) || 1) + 1);
}

function computeXp({ masteryScore, manualActions, noveltyHit, streakCurrent, spamDuplicate }) {
  const safeManualActions = Math.max(0, toInt(manualActions));
  const noveltyBonus = noveltyHit ? 8 : 0;
  const streakBonus = Math.min(7, Math.max(0, toInt(streakCurrent)));
  const spamPenalty = spamDuplicate ? 20 : 0;

  if (safeManualActions < 1) {
    return {
      xpGained: 0,
      noveltyBonus: 0,
      streakBonus: 0,
      spamPenalty: 0
    };
  }

  const rawXp = 10 + Math.round((Number(masteryScore) || 0) / 2) + noveltyBonus + streakBonus - spamPenalty;

  return {
    xpGained: Math.max(0, rawXp),
    noveltyBonus,
    streakBonus,
    spamPenalty
  };
}

function parseYmdToUtcDay(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function updateStreak(streak, activeYmd) {
  const next = {
    current: toInt(streak?.current),
    longest: toInt(streak?.longest),
    lastActiveDate: streak?.lastActiveDate || null
  };

  if (!activeYmd) return next;

  if (!next.lastActiveDate) {
    next.current = 1;
  } else if (next.lastActiveDate === activeYmd) {
    return next;
  } else {
    const prevDay = parseYmdToUtcDay(next.lastActiveDate);
    const activeDay = parseYmdToUtcDay(activeYmd);
    const diffDays = (prevDay != null && activeDay != null)
      ? Math.round((activeDay - prevDay) / (24 * 60 * 60 * 1000))
      : 999;

    if (diffDays === 1) next.current += 1;
    else next.current = 1;
  }

  next.longest = Math.max(next.longest, next.current);
  next.lastActiveDate = activeYmd;
  return next;
}

function evaluateAchievements({ profile, metrics }) {
  const unlocked = new Set(profile.achievementsUnlocked || []);
  const newlyUnlocked = [];

  const unlockIf = (id, condition) => {
    if (!condition || unlocked.has(id)) return;
    unlocked.add(id);
    newlyUnlocked.push(id);
  };

  unlockIf('starter_architect', profile.templatesSaved >= 5);
  unlockIf('palette_polyglot_i', metrics.uniqueTypes >= 6);
  unlockIf('palette_polyglot_ii', metrics.uniqueTypes >= 10);
  unlockIf('balance_master', metrics.totalComponents >= 12 && (metrics.dominantTypeShare || 0) <= 0.4);
  unlockIf('conditional_weaver', metrics.conditionalCount >= 5);
  unlockIf('grid_commander', metrics.hasEditgrid && metrics.hasDatagrid);
  unlockIf('handcrafted_run', (profile.handcraftedChain || 0) >= 3);
  unlockIf('neglected_revival', (profile.neglectedRevivalCount || 0) >= 5);

  return {
    achievementsUnlocked: Array.from(unlocked),
    newlyUnlocked
  };
}

function buildSilentCoach(scores = {}) {
  const pairs = [
    ['diversityScore', Number(scores.diversityScore) || 0],
    ['balanceScore', Number(scores.balanceScore) || 0],
    ['complexityScore', Number(scores.complexityScore) || 0],
    ['craftScore', Number(scores.craftScore) || 0]
  ];

  pairs.sort((a, b) => a[1] - b[1]);
  const weakest = pairs[0]?.[0] || 'diversityScore';

  if (weakest === 'diversityScore') {
    return 'Try introducing 1-2 component types you rarely use to boost diversity.';
  }
  if (weakest === 'balanceScore') {
    return 'Your top component dominates this build. Spread fields across more types.';
  }
  if (weakest === 'complexityScore') {
    return 'Add conditional logic, calculated fields, or a grid to increase structural depth.';
  }
  return 'Increase manual edits/adds to strengthen handcrafted mastery.';
}

module.exports = {
  ACHIEVEMENTS,
  LEVEL_THRESHOLDS,
  normalizeTelemetry,
  computeMasteryScores,
  computeXp,
  levelFromXp,
  nextLevelXp,
  updateStreak,
  evaluateAchievements,
  buildSilentCoach
};
