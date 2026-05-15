const dashboardDoctorAuthStorageKey = "noufar-doctor-auth-v1";
const dashboardApiBaseUrl = window.NOUFAR_API_BASE_URL || "http://localhost:5000/api";
const dashboardDoctorSessionBridge = window.NoufarDoctorSessionBridge || null;

const patientTotalNode = document.querySelector("#stat-patient-total");
const totalNode = document.querySelector("#stat-total");
const relapseNode = document.querySelector("#stat-relapse");
const noRelapseNode = document.querySelector("#stat-no-relapse");
const averageNode = document.querySelector("#stat-average");
const patientTotalNoteNode = document.querySelector("#stat-patient-total-note");
const totalNoteNode = document.querySelector("#stat-total-note");
const relapseNoteNode = document.querySelector("#stat-relapse-note");
const noRelapseNoteNode = document.querySelector("#stat-no-relapse-note");
const averageNoteNode = document.querySelector("#stat-average-note");
const patientTotalBarNode = document.querySelector("#stat-patient-total-bar");
const totalBarNode = document.querySelector("#stat-total-bar");
const relapseBarNode = document.querySelector("#stat-relapse-bar");
const noRelapseBarNode = document.querySelector("#stat-no-relapse-bar");
const averageBarNode = document.querySelector("#stat-average-bar");
const validationCorrectNode = document.querySelector("#validation-correct");
const validationPendingNode = document.querySelector("#validation-pending");
const validationIncorrectNode = document.querySelector("#validation-incorrect");
const validationCorrectNoteNode = document.querySelector("#validation-correct-note");
const validationPendingNoteNode = document.querySelector("#validation-pending-note");
const validationIncorrectNoteNode = document.querySelector("#validation-incorrect-note");
const validationCorrectBarNode = document.querySelector("#validation-correct-bar");
const validationPendingBarNode = document.querySelector("#validation-pending-bar");
const validationIncorrectBarNode = document.querySelector("#validation-incorrect-bar");
const recentHost = document.querySelector("#recent-activity");
const queueCountNode = document.querySelector("#queue-count");
const priorityListHost = document.querySelector("#priority-list");
let dashboardPatientTotalCount = 0;

const dashboardCountAnimations = new WeakMap();
const dashboardEaseOutCubic = (t) => 1 - Math.pow(1 - t, 3);

const animateStatCount = (node, target, options = {}) => {
  if (!node) return;
  const targetValue = Number(target) || 0;
  const {
    duration = 1100,
    decimals = 0,
    suffix = "",
    prefix = "",
    useGrouping = true,
  } = options;

  const previousFrame = dashboardCountAnimations.get(node);
  if (previousFrame) cancelAnimationFrame(previousFrame);

  const formatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping,
  });

  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || duration <= 0) {
    node.textContent = `${prefix}${formatter.format(targetValue)}${suffix}`;
    return;
  }

  const startValue = 0;
  const startTime = performance.now();

  const step = (now) => {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = dashboardEaseOutCubic(progress);
    const current = startValue + (targetValue - startValue) * eased;
    node.textContent = `${prefix}${formatter.format(current)}${suffix}`;
    if (progress < 1) {
      dashboardCountAnimations.set(node, requestAnimationFrame(step));
    } else {
      dashboardCountAnimations.delete(node);
      node.textContent = `${prefix}${formatter.format(targetValue)}${suffix}`;
    }
  };

  node.textContent = `${prefix}${formatter.format(startValue)}${suffix}`;
  dashboardCountAnimations.set(node, requestAnimationFrame(step));
};

const getDashboardDoctorSession = () => {
  try {
    const raw = window.localStorage.getItem(dashboardDoctorAuthStorageKey);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
};

const requestDashboardPredictions = async () => {
  if (dashboardDoctorSessionBridge?.requestJson) {
    const data = await dashboardDoctorSessionBridge.requestJson("/predictions");
    return Array.isArray(data) ? data : [];
  }

  const session = getDashboardDoctorSession();
  const token = session?.token;

  if (!token) {
    throw new Error("Doctor session token is missing. Please log in again.");
  }

  const response = await fetch(`${dashboardApiBaseUrl}/predictions`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json().catch(() => []);

  if (!response.ok) {
    throw new Error(data.message || "Unable to load dashboard predictions.");
  }

  return Array.isArray(data) ? data : [];
};

const requestDashboardPatients = async () => {
  if (dashboardDoctorSessionBridge?.requestJson) {
    const data = await dashboardDoctorSessionBridge.requestJson("/patients");
    return Array.isArray(data) ? data : [];
  }

  const session = getDashboardDoctorSession();
  const token = session?.token;

  if (!token) {
    throw new Error("Doctor session token is missing. Please log in again.");
  }

  const response = await fetch(`${dashboardApiBaseUrl}/patients`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json().catch(() => []);

  if (!response.ok) {
    throw new Error(data.message || "Unable to load dashboard patients.");
  }

  return Array.isArray(data) ? data : [];
};

const getFallbackPatientTotal = () => {
  const uniquePatients = new Set(
    patientPredictions
      .map((entry) => entry.patientId || entry.patient || entry.patientName || entry.id)
      .filter(Boolean)
      .map((value) => String(value).trim().toLowerCase())
  );

  return uniquePatients.size || patientPredictions.length;
};

const renderDashboardStats = () => {
  const stats = getDashboardStats();
  const averageProbability = getAverageProbability();
  const patientTotal = dashboardPatientTotalCount || getFallbackPatientTotal();

  animateStatCount(patientTotalNode, patientTotal);
  animateStatCount(totalNode, stats.total);
  animateStatCount(relapseNode, stats.relapse);
  animateStatCount(noRelapseNode, stats.noRelapse);
  animateStatCount(averageNode, averageProbability, {
    decimals: Number.isInteger(averageProbability) ? 0 : 1,
    suffix: "%",
    useGrouping: false,
  });

  const relapsePercent = stats.total ? Math.round((stats.relapse / stats.total) * 100) : 0;
  const stablePercent = stats.total ? 100 - relapsePercent : 0;
  const analyzedCoverage = patientTotal ? Math.min(Math.round((stats.total / patientTotal) * 100), 100) : 0;

  if (patientTotalNoteNode) {
    patientTotalNoteNode.textContent = `${patientTotal.toLocaleString()} patient${patientTotal === 1 ? "" : "s"} in your private cohort`;
  }
  if (totalNoteNode) {
    totalNoteNode.textContent = `${stats.total.toLocaleString()} prediction${stats.total === 1 ? "" : "s"} generated`;
  }
  if (relapseNoteNode) relapseNoteNode.textContent = `${relapsePercent}% of total cases`;
  if (noRelapseNoteNode) noRelapseNoteNode.textContent = `${stablePercent}% of total cases`;
  if (averageNoteNode) averageNoteNode.textContent = "Live cohort overview";
  if (patientTotalBarNode) patientTotalBarNode.style.width = patientTotal ? "100%" : "0%";
  if (totalBarNode) totalBarNode.style.width = `${analyzedCoverage}%`;
  if (relapseBarNode) relapseBarNode.style.width = `${relapsePercent}%`;
  if (noRelapseBarNode) noRelapseBarNode.style.width = `${stablePercent}%`;
  if (averageBarNode) averageBarNode.style.width = `${averageProbability}%`;
};

const getDashboardValidationSummary = () => {
  const summary = patientPredictions.reduce(
    (accumulator, entry) => {
      const actualOutcome = entry.actualOutcome || "";
      const savedStatus = entry.validationStatus || "Pending";
      const status =
        actualOutcome && savedStatus === "Pending"
          ? actualOutcome === entry.result
            ? "Correct"
            : "Incorrect"
          : savedStatus;

      if (status === "Correct") {
        accumulator.correct += 1;
      } else if (status === "Incorrect") {
        accumulator.incorrect += 1;
      } else {
        accumulator.pending += 1;
      }

      return accumulator;
    },
    { correct: 0, pending: 0, incorrect: 0 }
  );

  return {
    ...summary,
    total: patientPredictions.length,
  };
};

const renderDashboardValidationStats = () => {
  const validation = getDashboardValidationSummary();
  const total = validation.total || 0;
  const correctPercent = total ? Math.round((validation.correct / total) * 100) : 0;
  const pendingPercent = total ? Math.round((validation.pending / total) * 100) : 0;
  const incorrectPercent = total ? Math.round((validation.incorrect / total) * 100) : 0;

  animateStatCount(validationCorrectNode, validation.correct);
  animateStatCount(validationPendingNode, validation.pending);
  animateStatCount(validationIncorrectNode, validation.incorrect);

  if (validationCorrectNoteNode) {
    validationCorrectNoteNode.textContent = `${correctPercent}% of total predictions`;
  }
  if (validationPendingNoteNode) {
    validationPendingNoteNode.textContent = `${pendingPercent}% of total predictions`;
  }
  if (validationIncorrectNoteNode) {
    validationIncorrectNoteNode.textContent = `${incorrectPercent}% of total predictions`;
  }

  if (validationCorrectBarNode) validationCorrectBarNode.style.width = `${correctPercent}%`;
  if (validationPendingBarNode) validationPendingBarNode.style.width = `${pendingPercent}%`;
  if (validationIncorrectBarNode) validationIncorrectBarNode.style.width = `${incorrectPercent}%`;
};

const renderDashboardRecentActivity = () => {
  if (!recentHost) return;

  recentHost.innerHTML = "";

  getRecentPatients(6).forEach((entry) => {
    const badge = getPredictionBadge(entry);
    const shortId = entry.id.length > 14
      ? `${entry.id.slice(0, 8)}…${entry.id.slice(-4)}`
      : entry.id;
    const rawDoctorName = String(entry.predictedByName || "").trim();
    const predictedByName = !rawDoctorName
      ? "Unknown user"
      : /^dr\.?\s+/i.test(rawDoctorName)
        ? rawDoctorName
        : `Dr. ${rawDoctorName}`;
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><span class="table-id-pill" title="${entry.id}">${shortId}</span></td>
      <td><span class="table-date">${formatDate(entry.analyzedAt, true)}</span></td>
      <td><span class="table-predicted-by">${predictedByName}</span></td>
      <td><span class="prediction-badge ${badge.tone}">${badge.label}</span></td>
      <td>
        <span class="probability-cell ${entry.result === 'Relapse' ? 'prob-relapse' : 'prob-stable'}">
          <span class="probability-bar"><i style="width:${entry.probability}%"></i></span>
          <strong>${entry.probability}%</strong>
        </span>
      </td>
      <td>
        <a class="table-action-btn" href="prediction-details.html?id=${encodeURIComponent(entry.id)}" aria-label="View prediction details">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M2.5 12s3.6-6 9.5-6 9.5 6 9.5 6-3.6 6-9.5 6-9.5-6-9.5-6Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2" />
          </svg>
          <span>Details</span>
        </a>
      </td>
    `;
    recentHost.appendChild(row);
  });
};

const renderDashboardPriorityQueue = () => {
  const topRiskPatients = getTopRiskPatients(3);

  if (queueCountNode) {
    queueCountNode.textContent = `${topRiskPatients.length} case${topRiskPatients.length === 1 ? "" : "s"}`;
  }

  if (!priorityListHost) return;

  priorityListHost.innerHTML = "";

  topRiskPatients.forEach((entry, index) => {
    const badge = getPredictionBadge(entry);
    const shortId = entry.id.length > 12
      ? `${entry.id.slice(0, 6)}…${entry.id.slice(-4)}`
      : entry.id;
    const item = document.createElement("article");
    item.className = "priority-item";
    item.setAttribute("data-prediction-id", entry.id);
    item.setAttribute("role", "button");
    item.setAttribute("tabindex", "0");
    item.setAttribute("title", "Double-click to view prediction details");
    item.innerHTML = `
      <span class="priority-item-rank">${index + 1}</span>
      <div class="priority-item-body">
        <div class="priority-item-head">
          <div class="priority-item-info">
            <strong>${entry.patient}</strong>
            <span class="priority-item-id" title="${entry.id}">${shortId}</span>
            <span class="priority-item-meta">${formatDate(entry.analyzedAt, true)} · ${entry.source}</span>
          </div>
          <span class="prediction-badge ${badge.tone}">${badge.label}</span>
        </div>
        <div class="priority-item-prob ${entry.result === 'Relapse' ? 'prob-relapse' : 'prob-stable'}">
          <span class="priority-item-prob-track"><i style="width:${entry.probability}%"></i></span>
          <strong>${entry.probability}%</strong>
        </div>
      </div>
    `;
    const openDetails = () => {
      window.location.href = `prediction-details.html?id=${encodeURIComponent(entry.id)}`;
    };
    item.addEventListener("dblclick", openDetails);
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter") openDetails();
    });
    priorityListHost.appendChild(item);
  });
};

const renderDashboardError = (message) => {
  if (recentHost) {
    recentHost.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="history-empty-state">
            <strong>Unable to load recent predictions</strong>
            <span>${message}</span>
          </div>
        </td>
      </tr>
    `;
  }

  if (priorityListHost) {
    priorityListHost.innerHTML = `
      <div class="history-empty-state">
        <strong>Priority queue unavailable</strong>
        <span>${message}</span>
      </div>
    `;
  }
};

const loadDashboardPage = async () => {
  try {
    const [predictionsResult, patientsResult] = await Promise.allSettled([
      requestDashboardPredictions(),
      requestDashboardPatients(),
    ]);

    if (predictionsResult.status === "rejected") {
      throw predictionsResult.reason;
    }

    const predictions = predictionsResult.value;
    dashboardPatientTotalCount =
      patientsResult.status === "fulfilled" && Array.isArray(patientsResult.value)
        ? patientsResult.value.length
        : 0;

    if (typeof replacePatientPredictions === "function") {
      replacePatientPredictions(predictions);
    }

    renderDashboardStats();
    renderDashboardValidationStats();
    renderDashboardRecentActivity();
    renderDashboardPriorityQueue();
  } catch (error) {
    renderDashboardError(error instanceof Error ? error.message : "Unexpected dashboard error.");
  }
};

loadDashboardPage();
