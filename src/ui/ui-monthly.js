import { Chart } from 'chart.js';

export function createMonthlyUi({
  app,
  elements,
  formatMoney,
  summarizeRowsByDisplayCurrency,
  normalizeTagGroupIndex,
  normalizeMonthKey,
  normalizeMonthlyBoundaryDay,
  buildTagGroupPieDatasetAbsoluteNet,
  buildMonthlyNetUsdSeries,
  filterRowsByMonthlyCycleKey,
  describeMonthlyCycle,
  buildPiePalette,
  buildTagGroupPreviewLabel,
  escapeHtml,
  saveState,
  render
}) {
  function renderMonthly(rows, tagGroups) {
    const monthly = ensureMonthlyPrefs();
    let shouldPersist = false;

    const nextBoundaryDay = normalizeMonthlyBoundaryDay(monthly.boundaryDay);
    if (monthly.boundaryDay !== nextBoundaryDay) {
      monthly.boundaryDay = nextBoundaryDay;
      shouldPersist = true;
    }

    const nextRangeFrom = normalizeMonthKey(monthly.rangeFrom);
    const nextRangeTo = normalizeMonthKey(monthly.rangeTo);
    if (monthly.rangeFrom !== nextRangeFrom) {
      monthly.rangeFrom = nextRangeFrom;
      shouldPersist = true;
    }
    if (monthly.rangeTo !== nextRangeTo) {
      monthly.rangeTo = nextRangeTo;
      shouldPersist = true;
    }

    if (monthly.rangeFrom && monthly.rangeTo && monthly.rangeFrom > monthly.rangeTo) {
      const previousFrom = monthly.rangeFrom;
      monthly.rangeFrom = monthly.rangeTo;
      monthly.rangeTo = previousFrom;
      shouldPersist = true;
    }

    const monthlySeries = buildMonthlyNetUsdSeries(
      rows,
      monthly.boundaryDay,
      monthly.rangeFrom,
      monthly.rangeTo
    );

    const availableMonthKeys = new Set(monthlySeries.map((item) => item.monthKey));
    const normalizedSelectedKey = normalizeMonthKey(monthly.selectedMonthKey);
    const nextSelectedMonthKey =
      normalizedSelectedKey && availableMonthKeys.has(normalizedSelectedKey)
        ? normalizedSelectedKey
        : monthlySeries[0]?.monthKey || '';

    if (monthly.selectedMonthKey !== nextSelectedMonthKey) {
      monthly.selectedMonthKey = nextSelectedMonthKey;
      shouldPersist = true;
    }

    const selectedCycle = monthly.selectedMonthKey
      ? describeMonthlyCycle(monthly.selectedMonthKey, monthly.boundaryDay)
      : null;

    const selectedRows = monthly.selectedMonthKey
      ? filterRowsByMonthlyCycleKey(rows, monthly.boundaryDay, monthly.selectedMonthKey)
      : [];
    const selectedSummary = summarizeRowsByDisplayCurrency(selectedRows, 'USD');

    const selectedTagGroup = normalizeTagGroupIndex(
      monthly.selectedMonthlyTagGroup,
      tagGroups.groups.length
    );
    if (monthly.selectedMonthlyTagGroup !== selectedTagGroup) {
      monthly.selectedMonthlyTagGroup = selectedTagGroup;
      shouldPersist = true;
    }

    renderMonthlyTagGroupSelector(tagGroups, monthly);

    const tagPie = buildTagGroupPieDatasetAbsoluteNet(
      selectedRows,
      tagGroups,
      monthly.selectedMonthlyTagGroup,
      'USD'
    );

    renderMonthlyTotalsBar(monthlySeries, monthly.selectedMonthKey);
    renderMonthlyTagPieChart(tagPie);

    if (elements.monthlyTagChartTitle) {
      const titleSuffix = selectedCycle ? ` · ${selectedCycle.label}` : '';
      elements.monthlyTagChartTitle.textContent = `Share by tag (USD)${titleSuffix}`;
    }

    elements.monthlySelectedMonthLabel.textContent = selectedCycle?.label || '—';
    elements.monthlySelectedRangeLabel.textContent = `Range: ${selectedCycle?.rangeLabel || '—'}`;

    const selectedNetSign = selectedSummary.net > 0 ? '+' : '';
    elements.monthlySelectedNet.textContent = `${selectedNetSign}${formatMoney(selectedSummary.net)}`;
    elements.monthlySelectedUnresolved.textContent = `Unresolved rows: ${selectedSummary.unresolved}`;

    const visibleRows = monthlySeries.reduce((sum, item) => sum + item.rowCount, 0);
    elements.monthlyVisibleMonths.textContent = String(monthlySeries.length);
    elements.monthlyVisibleRows.textContent = `Rows in visible range: ${visibleRows}`;

    if (shouldPersist) {
      saveState();
    }
  }

  function renderMonthlyTotalsBar(monthlySeries, selectedMonthKey) {
    if (app.monthlyTotalsChart) {
      app.monthlyTotalsChart.destroy();
    }

    const hasData = monthlySeries.length > 0;
    const chartItems = hasData
      ? monthlySeries
      : [
          {
            monthKey: '',
            label: 'No data',
            rangeLabel: 'No rows in selected range.',
            signedNet: 0
          }
        ];

    app.monthlyTotalsChart = new Chart(elements.monthlyTotalsChart, {
      type: 'bar',
      data: {
        labels: chartItems.map((item) => item.label),
        datasets: [
          {
            label: 'Monthly net (USD)',
            data: chartItems.map((item) => item.signedNet),
            borderRadius: 8,
            borderWidth: 1,
            backgroundColor: chartItems.map((item) => {
              if (!hasData) {
                return 'rgba(130, 142, 150, 0.45)';
              }
              if (item.monthKey === selectedMonthKey) {
                return 'rgba(0, 123, 107, 0.75)';
              }
              return item.signedNet >= 0 ? 'rgba(0, 123, 107, 0.35)' : 'rgba(220, 53, 69, 0.35)';
            }),
            borderColor: chartItems.map((item) => {
              if (!hasData) {
                return 'rgba(94, 103, 110, 0.95)';
              }
              if (item.monthKey === selectedMonthKey) {
                return 'rgba(0, 94, 82, 0.98)';
              }
              return item.signedNet >= 0 ? 'rgba(0, 94, 82, 0.7)' : 'rgba(160, 42, 42, 0.7)';
            })
          }
        ]
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            ticks: {
              color: '#4e6166'
            },
            grid: {
              color: 'rgba(22, 34, 38, 0.08)'
            }
          },
          y: {
            ticks: {
              color: '#4e6166',
              callback(value) {
                return formatMoney(Number(value || 0));
              }
            },
            grid: {
              color: 'rgba(22, 34, 38, 0.08)'
            }
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              title(context) {
                return context[0]?.label || 'Month';
              },
              label(context) {
                const signed = Number(context.parsed?.y || 0);
                const sign = signed > 0 ? '+' : '';
                return `Net USD: ${sign}${formatMoney(signed)} USD`;
              },
              afterLabel(context) {
                const item = chartItems[context.dataIndex];
                if (!item) {
                  return '';
                }
                if (!hasData) {
                  return item.rangeLabel;
                }
                return [
                  `Cycle: ${item.rangeLabel}`,
                  `Rows: ${item.rowCount} · Unresolved: ${item.unresolvedRows}`
                ];
              }
            }
          }
        },
        onClick(_event, activeElements) {
          if (!hasData || !activeElements.length) {
            return;
          }

          const clickedIndex = activeElements[0]?.index;
          const nextMonthKey = chartItems[clickedIndex]?.monthKey;
          if (!nextMonthKey || nextMonthKey === app.state.uiPrefs.monthly?.selectedMonthKey) {
            return;
          }

          const monthly = ensureMonthlyPrefs();
          monthly.selectedMonthKey = nextMonthKey;
          saveState();
          render();
        }
      }
    });
  }

  function renderMonthlyTagGroupSelector(tagGroups, monthly) {
    if (!elements.monthlyTagGroupSelect) {
      return;
    }

    if (!tagGroups.hasGroups) {
      elements.monthlyTagGroupSelect.innerHTML = '<option value="0">No groups defined</option>';
      elements.monthlyTagGroupSelect.disabled = true;
      return;
    }

    const options = tagGroups.groups.map((group) => {
      const label = buildTagGroupPreviewLabel(group, group.index);
      return `<option value="${group.index}">${escapeHtml(label)}</option>`;
    });
    elements.monthlyTagGroupSelect.innerHTML = options.join('');
    elements.monthlyTagGroupSelect.disabled = !tagGroups.isValid;

    const selectedGroup = normalizeTagGroupIndex(monthly.selectedMonthlyTagGroup, tagGroups.groups.length);
    elements.monthlyTagGroupSelect.value = String(selectedGroup);
  }

  function renderMonthlyTagPieChart(data) {
    if (app.monthlyTagChart) {
      app.monthlyTagChart.destroy();
    }

    app.monthlyTagChart = buildPieChart(
      elements.monthlyTagChart,
      data,
      'Tag share',
      elements.monthlyTagChartNet,
      elements.monthlyTagLegendToggle,
      'USD'
    );
  }

  function buildPieChart(canvas, items, title, netElement, toggleButton, displayCurrency) {
    const hasData = items.length > 0;
    const chartItems = hasData
      ? items
      : [
          {
            label: 'No data',
            absoluteNet: 1,
            signedNet: 0
          }
        ];

    const totalWeight = chartItems.reduce((sum, item) => sum + item.absoluteNet, 0) || 1;
    const palette = buildPiePalette(
      chartItems.map((item) => item.label),
      hasData
    );

    const chart = new Chart(canvas, {
      type: 'pie',
      data: {
        labels: chartItems.map((item) => item.label),
        datasets: [
          {
            label: `${title} (${displayCurrency})`,
            data: chartItems.map((item) => item.absoluteNet),
            backgroundColor: palette.background,
            borderColor: palette.border,
            borderWidth: 1
          }
        ]
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              color: '#37474f',
              boxWidth: 14,
              boxHeight: 14
            },
            onHover(event, legendItem, legend) {
              const index = legendItem?.index;
              if (typeof index !== 'number') {
                return;
              }

              const hoveredChart = legend.chart;
              const active = [{ datasetIndex: 0, index }];
              hoveredChart.setActiveElements(active);
              hoveredChart.tooltip.setActiveElements(active, { x: event.x || 0, y: event.y || 0 });
              hoveredChart.update('none');
            },
            onLeave(_event, _legendItem, legend) {
              const leftChart = legend.chart;
              leftChart.setActiveElements([]);
              leftChart.tooltip.setActiveElements([], { x: 0, y: 0 });
              leftChart.update('none');
            },
            onClick(_event, legendItem, legend) {
              const index = legendItem?.index;
              if (typeof index !== 'number') {
                return;
              }

              const clickedChart = legend.chart;
              clickedChart.toggleDataVisibility(index);
              clickedChart.setActiveElements([]);
              clickedChart.tooltip.setActiveElements([], { x: 0, y: 0 });
              clickedChart.update();
              updateChartNetLabel(clickedChart, chartItems, netElement, displayCurrency);
              syncLegendToggleButtonLabel(clickedChart, chartItems, toggleButton, hasData);
            }
          },
          tooltip: {
            callbacks: {
              title(context) {
                return context[0]?.label || title;
              },
              label(context) {
                if (!hasData) {
                  return `No resolved ${displayCurrency} rows for this chart.`;
                }

                const item = chartItems[context.dataIndex];
                const signedPrefix = item.signedNet >= 0 ? '+' : '';
                return `Net ${displayCurrency}: ${signedPrefix}${formatMoney(item.signedNet)} ${displayCurrency}`;
              },
              afterLabel(context) {
                if (!hasData) {
                  return '';
                }

                const item = chartItems[context.dataIndex];
                const fullPieShare = ((item.absoluteNet / totalWeight) * 100).toFixed(1);
                const visibleTotal = getVisibleAbsoluteTotal(context.chart, chartItems);
                const visibleShare =
                  visibleTotal > 0 ? `${((item.absoluteNet / visibleTotal) * 100).toFixed(1)}%` : '—';
                return [`Full pie: ${fullPieShare}%`, `Visible slices: ${visibleShare}`];
              }
            }
          }
        }
      }
    });

    if (toggleButton) {
      toggleButton.onclick = () => {
        if (!hasData) {
          return;
        }

        const showAll = !areAllSlicesVisible(chart, chartItems);
        setAllSlicesVisibility(chart, chartItems, showAll);
        chart.setActiveElements([]);
        chart.tooltip.setActiveElements([], { x: 0, y: 0 });
        chart.update();
        updateChartNetLabel(chart, chartItems, netElement, displayCurrency);
        syncLegendToggleButtonLabel(chart, chartItems, toggleButton, hasData);
      };
    }

    updateChartNetLabel(chart, chartItems, netElement, displayCurrency);
    syncLegendToggleButtonLabel(chart, chartItems, toggleButton, hasData);
    return chart;
  }

  function updateChartNetLabel(chart, chartItems, netElement, displayCurrency) {
    if (!netElement) {
      return;
    }

    let visibleNet = 0;
    for (let index = 0; index < chartItems.length; index += 1) {
      if (chart.getDataVisibility(index)) {
        visibleNet += chartItems[index].signedNet;
      }
    }

    const sign = visibleNet > 0 ? '+' : '';
    netElement.textContent = `Net ${displayCurrency}: ${sign}${formatMoney(visibleNet)}`;
  }

  function getVisibleAbsoluteTotal(chart, chartItems) {
    let visibleTotal = 0;
    for (let index = 0; index < chartItems.length; index += 1) {
      if (chart.getDataVisibility(index)) {
        visibleTotal += chartItems[index].absoluteNet;
      }
    }
    return visibleTotal;
  }

  function areAllSlicesVisible(chart, chartItems) {
    for (let index = 0; index < chartItems.length; index += 1) {
      if (!chart.getDataVisibility(index)) {
        return false;
      }
    }
    return true;
  }

  function setAllSlicesVisibility(chart, chartItems, visible) {
    for (let index = 0; index < chartItems.length; index += 1) {
      const isVisible = chart.getDataVisibility(index);
      if (isVisible !== visible) {
        chart.toggleDataVisibility(index);
      }
    }
  }

  function syncLegendToggleButtonLabel(chart, chartItems, button, hasData) {
    if (!button) {
      return;
    }

    if (!hasData) {
      button.disabled = true;
      button.textContent = 'Show all';
      return;
    }

    button.disabled = false;
    button.textContent = areAllSlicesVisible(chart, chartItems) ? 'Hide all' : 'Show all';
  }

  function ensureMonthlyPrefs() {
    if (!app.state.uiPrefs.monthly || typeof app.state.uiPrefs.monthly !== 'object') {
      app.state.uiPrefs.monthly = {
        boundaryDay: 21,
        rangeFrom: '',
        rangeTo: '',
        selectedMonthKey: '',
        selectedMonthlyTagGroup: 0
      };
    }

    return app.state.uiPrefs.monthly;
  }

  return {
    renderMonthly
  };
}
