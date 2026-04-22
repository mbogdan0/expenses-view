import { Chart } from 'chart.js';

export function createChartsUi({
  app,
  elements,
  formatMoney,
  summarizeUah,
  countSelectedCalendarDays,
  buildCategoryPieDatasetUAHAbsoluteNet,
  buildTagGroupPieDatasetUAHAbsoluteNet,
  buildPiePalette,
  normalizeTagGroupIndex,
  buildTagGroupPreviewLabel,
  escapeHtml
}) {
  function renderCharts(rows, tagGroups) {
    const summary = summarizeUah(rows);
    elements.cardNet.textContent = formatMoney(summary.net);
    elements.cardNetInflow.textContent = `Total inflow: ${formatMoney(summary.inflow)} · Total outflow: ${formatMoney(summary.outflow)}`;
    elements.cardUnresolved.textContent = String(summary.unresolved);
    const selectedDays = countSelectedCalendarDays(
      app.state.uiPrefs.filters.dateFrom,
      app.state.uiPrefs.filters.dateTo
    );
    elements.cardSelectedDays.textContent = selectedDays === null ? '—' : String(selectedDays);

    renderChartTagGroupSelector(tagGroups);

    const categoryPie = buildCategoryPieDatasetUAHAbsoluteNet(rows);
    const tagPie = buildTagGroupPieDatasetUAHAbsoluteNet(
      rows,
      tagGroups,
      app.state.uiPrefs.selectedTagGroup
    );

    renderCategoryPieChart(categoryPie);
    renderTagPieChart(tagPie);
  }

  function renderChartTagGroupSelector(tagGroups) {
    if (!elements.chartTagGroupSelect) {
      return;
    }

    if (!tagGroups.hasGroups) {
      elements.chartTagGroupSelect.innerHTML = '<option value="0">No groups defined</option>';
      elements.chartTagGroupSelect.disabled = true;
      return;
    }

    const options = tagGroups.groups.map((group) => {
      const label = buildTagGroupPreviewLabel(group, group.index);
      return `<option value="${group.index}">${escapeHtml(label)}</option>`;
    });
    elements.chartTagGroupSelect.innerHTML = options.join('');
    elements.chartTagGroupSelect.disabled = !tagGroups.isValid;

    const selectedGroup = normalizeTagGroupIndex(app.state.uiPrefs.selectedTagGroup, tagGroups.groups.length);
    elements.chartTagGroupSelect.value = String(selectedGroup);
  }

  function renderCategoryPieChart(data) {
    if (app.categoryChart) {
      app.categoryChart.destroy();
    }

    app.categoryChart = buildPieChart(
      elements.categoryChart,
      data,
      'Final category share',
      elements.categoryChartNet,
      elements.categoryLegendToggle
    );
  }

  function renderTagPieChart(data) {
    if (app.tagChart) {
      app.tagChart.destroy();
    }

    app.tagChart = buildPieChart(
      elements.tagChart,
      data,
      'Tag share',
      elements.tagChartNet,
      elements.tagLegendToggle
    );
  }

  function buildPieChart(canvas, items, title, netElement, toggleButton) {
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
            label: `${title} (UAH)`,
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
              updateChartNetLabel(clickedChart, chartItems, netElement);
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
                  return 'No resolved UAH rows for this chart.';
                }

                const item = chartItems[context.dataIndex];
                const signedPrefix = item.signedNet >= 0 ? '+' : '';
                return `Net UAH: ${signedPrefix}${formatMoney(item.signedNet)} UAH`;
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
        updateChartNetLabel(chart, chartItems, netElement);
        syncLegendToggleButtonLabel(chart, chartItems, toggleButton, hasData);
      };
    }

    updateChartNetLabel(chart, chartItems, netElement);
    syncLegendToggleButtonLabel(chart, chartItems, toggleButton, hasData);
    return chart;
  }

  function updateChartNetLabel(chart, chartItems, netElement) {
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
    netElement.textContent = `Net UAH: ${sign}${formatMoney(visibleNet)}`;
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

  return {
    renderCharts
  };
}
