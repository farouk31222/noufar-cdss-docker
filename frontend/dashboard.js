const dashboardDoctorAuthStorageKey = "noufar-doctor-auth-v1";
const dashboardApiBaseUrl = window.NOUFAR_API_BASE_URL || "http://localhost:5000/api";
const dashboardDoctorSessionBridge = window.NoufarDoctorSessionBridge || null;

const totalNode = document.querySelector("#stat-total");
const relapseNode = document.querySelector("#stat-relapse");
const noRelapseNode = document.querySelector("#stat-no-relapse");
const averageNode = document.querySelector("#stat-average");
const totalNoteNode = document.querySelector("#stat-total-note");
const relapseNoteNode = document.querySelector("#stat-relapse-note");
const noRelapseNoteNode = document.querySelector("#stat-no-relapse-note");
const averageNoteNode = document.querySelector("#stat-average-note");
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

const renderDashboardStats = () => {
  const stats = getDashboardStats();
  const averageProbability = getAverageProbability();

  if (totalNode) totalNode.textContent = stats.total.toLocaleString();
  if (relapseNode) relapseNode.textContent = stats.relapse.toLocaleString();
  if (noRelapseNode) noRelapseNode.textContent = stats.noRelapse.toLocaleString();
  if (averageNode) averageNode.textContent = `${averageProbability}%`;

  const relapsePercent = stats.total ? Math.round((stats.relapse / stats.total) * 100) : 0;
  const stablePercent = stats.total ? 100 - relapsePercent : 0;

  if (totalNoteNode) totalNoteNode.textContent = `${relapsePercent}% flagged for closer follow-up`;
  if (relapseNoteNode) relapseNoteNode.textContent = `${relapsePercent}% of total cases`;
  if (noRelapseNoteNode) noRelapseNoteNode.textContent = `${stablePercent}% of total cases`;
  if (averageNoteNode) averageNoteNode.textContent = "Live cohort overview";
  if (totalBarNode) totalBarNode.style.width = "100%";
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

  if (validationCorrectNode) validationCorrectNode.textContent = validation.correct.toLocaleString();
  if (validationPendingNode) validationPendingNode.textContent = validation.pending.toLocaleString();
  if (validationIncorrectNode) validationIncorrectNode.textContent = validation.incorrect.toLocaleString();

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

  getRecentPatients().forEach((entry) => {
    const badge = getPredictionBadge(entry);
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${entry.id}</td>
      <td>${formatDate(entry.analyzedAt, true)}</td>
      <td>${formatPredictedByDisplay(entry.predictedByName)}</td>
      <td><span class="prediction-badge ${badge.tone}">${badge.label}</span></td>
      <td>
        <span class="probability-cell ${entry.result === 'Relapse' ? 'prob-relapse' : 'prob-stable'}">
          <strong>${entry.probability}%</strong>
          <span class="probability-bar"><i style="width:${entry.probability}%"></i></span>
        </span>
      </td>
      <td><a class="table-action" href="prediction-details.html?id=${encodeURIComponent(entry.id)}">Details</a></td>
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

  topRiskPatients.forEach((entry) => {
    const badge = getPredictionBadge(entry);
    const item = document.createElement("article");
    item.className = "priority-item";
    item.innerHTML = `
      <div class="priority-item-head">
        <div>
          <strong>${entry.id} - ${entry.patient}</strong>
          <span>${formatDate(entry.analyzedAt, true)} - ${entry.source}</span>
        </div>
        <span class="prediction-badge ${badge.tone}">${badge.label}</span>
      </div>
      <span class="probability-cell ${entry.result === 'Relapse' ? 'prob-relapse' : 'prob-stable'}">
        <strong>${entry.probability}%</strong>
        <span class="probability-bar"><i style="width:${entry.probability}%"></i></span>
      </span>
    `;
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
    const predictions = await requestDashboardPredictions();
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
