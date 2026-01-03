// ============================================================================
// 全局配置
// ============================================================================
const margin = { top: 80, right: 60, bottom: 100, left: 80 };
let width = 0, height = 0;

const state = {
    sets: [],
    themes: [],
    ctx: null,
    transform: d3.zoomIdentity,
    currentLayout: 'bar',
    themeStats: [],

    // 交互状态
    barMode: 'drop',
    filterYear: 1950,
    activeTheme: null,
    hoveredSet: null,
    mouse: { x: 0, y: 0 }
};

// ============================================================================
// 1. 初始化
// ============================================================================
async function init() {
    const canvas = document.getElementById("main-canvas");
    const container = document.querySelector(".vis-container");
    width = container.clientWidth;
    height = container.clientHeight;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    state.ctx = canvas.getContext("2d");
    state.ctx.scale(dpr, dpr);
    state.ctx.globalCompositeOperation = "screen";

    try {
        const [sets, themes] = await Promise.all([
            d3.csv("./public/sets.csv"),
            d3.csv("./public/themes.csv")
        ]);

        processData(sets, themes);
        setupInteraction(canvas);
        setupTimeSlider();

        requestAnimationFrame(animate);
        switchLayout('bar');

        d3.select("#loading").style("opacity", 0).remove();

    } catch (e) {
        console.error(e);
        alert("数据加载失败。");
    }
}

function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    const h = Math.abs(hash % 360);
    const s = 65;
    const l = 55;
    return `hsl(${h}, ${s}%, ${l}%)`;
}

// ============================================================================
// 2. 数据处理
// ============================================================================
function processData(sets, themes) {
    const themeMap = new Map();
    themes.forEach(t => themeMap.set(t.id, t));

    const getRoot = (id) => {
        let t = themeMap.get(id);
        let safe = 0;
        while (t && t.parent_id && themeMap.get(t.parent_id) && safe < 10) {
            t = themeMap.get(t.parent_id);
            safe++;
        }
        return t ? t.name : "Other";
    };

    let rawSets = sets.filter(s => +s.year >= 1950 && +s.num_parts > 0);
    rawSets.sort((a, b) => +a.year - +b.year);

    const maxParticles = 4000;
    if (rawSets.length > maxParticles) {
        rawSets = rawSets.filter((d, i) => i % Math.ceil(rawSets.length / maxParticles) === 0);
    }

    const themeCounts = d3.rollup(rawSets, v => v.length, d => getRoot(d.theme_id));
    state.themeStats = Array.from(themeCounts, ([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10); // Top 10

    const topThemes = state.themeStats.map(d => d.key);

    state.sets = rawSets.map((d, i) => {
        const rootTheme = getRoot(d.theme_id);
        const isTop = topThemes.includes(rootTheme);
        return {
            index: i,
            id: d.set_num,
            name: d.name,
            year: +d.year,
            parts: +d.num_parts,
            theme: rootTheme,
            color: stringToColor(rootTheme),

            // 坐标
            x: width / 2, y: height / 2,
            tx: width / 2, ty: height / 2,

            // 渲染属性 (稍微调大一点以便填满大图表)
            r: Math.sqrt(+d.num_parts) * 0.18 + 1.8,
            alpha: 1,
            currAlpha: 0,

            // 动画相位
            phase: Math.random() * Math.PI * 2,

            isTop10: isTop
        };
    });

    renderLegend(state.themeStats);
    document.getElementById("total-count").innerText = state.sets.length.toLocaleString();
}

// ============================================================================
// 3. 布局算法
// ============================================================================

window.switchLayout = function (mode) {
    state.currentLayout = mode;

    if (window.event) {
        const btn = window.event.currentTarget.closest('.btn');
        document.querySelectorAll(".btn").forEach(b => b.classList.remove("active"));
        if (btn) btn.classList.add("active");
    }

    const meta = {
        'bar': { t: 'Top 10 榜单', h: '• [时光折叠]：过滤年份\n• [单年切片]：查看特定年份' },
        'timeline': { t: '历史演变长河', h: '• 静态流图展示\n• 点击图例筛选主题' },
        'radial': { t: '复杂性雷达', h: '• 角度=年份，半径=复杂度\n• 时间轴在外圈，展示复杂度膨胀' },
        'distribution': { t: '复杂度分布峰峦', h: '• X轴=零件数 (对数)，Y轴=套装数量\n• 揭示“长尾效应”和主题分布差异' }
    };
    document.getElementById("current-view-name").innerText = meta[mode].t;
    document.getElementById("interaction-hint").innerText = meta[mode].h;

    const slider = document.getElementById("slider-controls");
    const barCtrls = document.getElementById("bar-controls");

    d3.select("#overlay-svg").selectAll("*").remove();

    // 控件逻辑
    if (mode === 'bar') {
        slider.classList.remove("hidden");
        barCtrls.classList.remove("hidden");
        layoutBarChart();
    } else if (mode === 'radial') {
        slider.classList.remove("hidden");
        barCtrls.classList.add("hidden");
        state.barMode = 'drop'; // Reset
        layoutRadial();
    } else {
        slider.classList.add("hidden");
        barCtrls.classList.add("hidden");
        if (mode === 'timeline') layoutTimeline();
        else if (mode === 'distribution') layoutDistribution();
    }

    // 重置年份
    state.filterYear = 1950;
    document.getElementById("time-slider").value = 1950;
    document.getElementById("year-display").innerText = "1950 - 2017";

    state.transform = d3.zoomIdentity;
};

window.setBarMode = function (mode) {
    state.barMode = mode;
    document.querySelectorAll(".toggle-btn").forEach(b => b.classList.remove("active"));
    document.getElementById(`mode-${mode}`).classList.add("active");

    const label = document.getElementById("slider-title");
    if (mode === 'drop') {
        label.innerText = "TIME DROP: ";
        document.getElementById("year-display").innerText = `${state.filterYear} - 2017`;
    } else {
        label.innerText = "TIME SLICE: ";
        document.getElementById("year-display").innerText = `Year ${state.filterYear}`;
    }
};

// === Chart 1: Bar Chart ===
function layoutBarChart() {
    const x = d3.scaleBand()
        .domain(state.themeStats.map(d => d.key))
        .range([margin.left, width - margin.right])
        .padding(0.4);

    const y = d3.scaleLinear()
        .domain([0, d3.max(state.themeStats, d => d.count)])
        .range([height - margin.bottom, margin.top]);

    const themeCounts = new Map(state.themeStats.map(d => [d.key, d.count]));

    state.sets.forEach(d => {
        if (d.isTop10) {
            d.tx = x(d.theme) + Math.random() * x.bandwidth();
            const hVal = themeCounts.get(d.theme);
            const yPos = y(hVal);
            d.ty = yPos + Math.random() * (height - margin.bottom - yPos);
            d.alpha = 1;
        } else {
            d.tx = width / 2; d.ty = height + 100; d.alpha = 0;
        }
    });

    drawAxes(x, y, "LEGO 主题 (Top 10)", "套装数量");
}

// === Chart 2: Timeline ===
function layoutTimeline() {
    const topThemes = state.themeStats.map(d => d.key);
    const countsByYear = d3.rollup(state.sets, v => v.length, d => d.year, d => d.theme);
    const years = Array.from(countsByYear.keys()).sort((a, b) => a - b);

    const streamData = years.map(year => {
        const yearData = { year };
        topThemes.forEach(theme => {
            yearData[theme] = countsByYear.get(year)?.get(theme) || 0;
        });
        return yearData;
    });

    const stack = d3.stack().keys(topThemes).order(d3.stackOrderInsideOut).offset(d3.stackOffsetNone);
    const stackedSeries = stack(streamData);

    const x = d3.scaleLinear().domain(d3.extent(years)).range([margin.left, width - margin.right]);
    const yMax = d3.max(stackedSeries, series => d3.max(series, d => d[1]));
    const y = d3.scaleLinear().domain([0, yMax]).range([height - margin.bottom, margin.top]);

    const themePositions = {};
    stackedSeries.forEach((series, i) => {
        const theme = topThemes[i];
        themePositions[theme] = {};
        series.forEach(d => {
            themePositions[theme][d.data.year] = [d[0], d[1]];
        });
    });

    state.sets.forEach(d => {
        if (themePositions[d.theme] && themePositions[d.theme][d.year]) {
            const [y0, y1] = themePositions[d.theme][d.year];
            d.tx = x(d.year);
            d.ty = y(y0) + Math.random() * (y(y1) - y(y0));
            d.alpha = 1;
        } else {
            d.tx = width / 2; d.ty = height + 50; d.alpha = 0;
        }
    });
    drawAxes(x, y, "发行年份", "套装总数");
    drawStreamAreas(x, y, stackedSeries);
}

// === Chart 3: Radial ===
function layoutRadial() {
    const centerX = width / 2;
    const centerY = height / 2;
    const angleScale = d3.scaleLinear()
        .domain([1950, 2017])
        .range([-Math.PI / 2, Math.PI * 1.5]);

    const radiusScale = d3.scaleLog()
        .domain([1, d3.max(state.sets, d => d.parts)])
        .range([50, Math.min(width, height) / 2 - 50]);

    state.sets.forEach(d => {
        const angle = angleScale(d.year) + (Math.random() - 0.5) * 0.05;
        const r = radiusScale(d.parts);
        d.tx = centerX + Math.cos(angle) * r;
        d.ty = centerY + Math.sin(angle) * r;
        d.alpha = 1;
    });

    drawRadialTimeAxis(centerX, centerY, angleScale);
    drawRadialComplexityCircles(centerX, centerY, radiusScale);
}

// === Chart 4: Complexity Distribution (Visual Boost) ===
function layoutDistribution() {
    // X轴: 零件数 (Log Scale) - 铺满全屏
    const x = d3.scaleLog()
        .domain([1, d3.max(state.sets, d => d.parts)])
        .range([margin.left, width - margin.right]);

    // 分箱逻辑 (Histogram)
    const binCount = 80; // 更多的桶，更细致的分布
    const minLog = Math.log(1);
    const maxLog = Math.log(d3.max(state.sets, d => d.parts));
    const binWidth = (maxLog - minLog) / binCount;

    // 统计每个桶的高度
    const bins = new Array(binCount).fill(0);

    // 视觉堆叠参数
    const stackHeight = 6; // 粒子高度增加，让山峰更高
    const groundY = height - margin.bottom;

    // 为了美观，先打乱顺序，避免同一颜色的粒子完全扎堆（虽然扎堆也有好处）
    // 但为了让分布更自然，我们保持原序，这样同主题的会聚在一起

    state.sets.forEach(d => {
        const valLog = Math.log(d.parts > 0 ? d.parts : 1);
        let binIdx = Math.floor((valLog - minLog) / binWidth);
        if (binIdx < 0) binIdx = 0;
        if (binIdx >= binCount) binIdx = binCount - 1;

        // 计算坐标：X轴在桶内随机，Y轴堆叠
        const binCenterX = x(Math.exp(minLog + (binIdx + 0.5) * binWidth));
        // 桶宽对应的像素宽，大概估算
        const pixelBinWidth = (width - margin.left - margin.right) / binCount;

        d.tx = binCenterX + (Math.random() - 0.5) * pixelBinWidth;
        d.ty = groundY - (bins[binIdx] * stackHeight) - 3; // 向上堆叠
        d.alpha = 1;

        bins[binIdx]++;
    });

    // 绘制坐标轴 (Y轴不需要刻度，看高度即可)
    drawAxes(x, null, "零件数量 (复杂度, Log Scale)", "套装分布密度 (Frequency)");

    // 绘制辅助网格线，增强可读性
    const svg = d3.select("#overlay-svg g");
    const xAxisGrid = d3.axisBottom(x).tickSize(-height + margin.top + margin.bottom).tickFormat("");
    svg.append("g").attr("class", "grid-line")
        .attr("transform", `translate(0, ${height - margin.bottom})`)
        .call(xAxisGrid);
}

// ============================================================================
// 4. SVG 辅助
// ============================================================================
function drawAxes(scaleX, scaleY, labelX, labelY) {
    const svg = d3.select("#overlay-svg");
    const g = svg.append("g");

    // X轴
    let axisX;
    if (state.currentLayout === 'distribution') {
        axisX = d3.axisBottom(scaleX).ticks(10, d3.format("~s")); // Log scale format
    } else {
        axisX = d3.axisBottom(scaleX).tickFormat(d3.format("d")).ticks(width / 80);
        if (state.currentLayout === 'bar') axisX.tickFormat(d => d);
    }

    g.append("g").attr("transform", `translate(0, ${height - margin.bottom})`)
        .attr("class", "axis").call(axisX)
        .append("text").attr("x", width / 2).attr("y", 40).attr("class", "axis-title")
        .attr("text-anchor", "middle").text(labelX);

    // Y轴
    if (scaleY) {
        const axisY = d3.axisLeft(scaleY);
        if (state.currentLayout === 'bar' || state.currentLayout === 'timeline') axisY.ticks(5, d3.format("~s"));

        g.append("g").attr("transform", `translate(${margin.left}, 0)`).attr("class", "axis").call(axisY)
            .append("text").attr("transform", "rotate(-90)").attr("y", -50)
            .attr("x", -(height / 2)).attr("dy", "1em").attr("class", "axis-title")
            .style("text-anchor", "middle").text(labelY);
    } else if (state.currentLayout === 'distribution') {
        // 分布图 Y 轴标题
        g.append("text").attr("transform", "rotate(-90)").attr("y", margin.left - 40)
            .attr("x", -(height / 2)).attr("dy", "1em").attr("class", "axis-title")
            .style("text-anchor", "middle").text(labelY);
    }
}

function drawStreamAreas(xScale, yScale, series) {
    const area = d3.area().x(d => xScale(d.data.year)).y0(d => yScale(d[0])).y1(d => yScale(d[1])).curve(d3.curveBasis);
    d3.select("#overlay-svg").append("g").selectAll("path").data(series).join("path")
        .attr("d", area).attr("fill", d => stringToColor(d.key)).attr("opacity", 0.15);
}

function drawRadialTimeAxis(cx, cy, angleScale) {
    const svg = d3.select("#overlay-svg");
    const g = svg.append("g").attr("transform", `translate(${cx}, ${cy})`);
    const rMax = Math.min(width, height) / 2 - 50;

    const decades = [1950, 1960, 1970, 1980, 1990, 2000, 2010];
    decades.forEach(y => {
        const a = angleScale(y);
        const x = Math.cos(a) * rMax;
        const yPos = Math.sin(a) * rMax;
        g.append("line").attr("x1", 0).attr("y1", 0).attr("x2", x).attr("y2", yPos).attr("stroke", "#333").attr("stroke-dasharray", "2,2");
        g.append("text").attr("x", x * 1.1).attr("y", yPos * 1.1).text(y).attr("class", "axis-text").attr("fill", "#f59e0b").attr("text-anchor", "middle").attr("alignment-baseline", "middle");
    });
}
function drawRadialComplexityCircles(cx, cy, rScale) {
    const svg = d3.select("#overlay-svg g");
    [10, 100, 1000, 5000].forEach(parts => {
        const r = rScale(parts);
        svg.append("circle").attr("r", r).attr("class", "grid-circle");
        svg.append("text").attr("y", -r - 5).text(parts + "p").attr("class", "axis-text").attr("text-anchor", "middle").style("font-size", "9px");
    });
}

// ============================================================================
// 5. 动画与交互
// ============================================================================
function setupTimeSlider() {
    const slider = document.getElementById("time-slider");
    const display = document.getElementById("year-display");
    slider.oninput = function () {
        state.filterYear = +this.value;
        if (state.barMode === 'slice' && state.currentLayout === 'bar') {
            display.innerText = `Year: ${state.filterYear}`;
        } else {
            display.innerText = `${state.filterYear} - 2017`;
        }
    };
}

function animate() {
    const ctx = state.ctx;
    ctx.clearRect(0, 0, width, height);

    state.sets.forEach(d => {
        let targetX = d.tx;
        let targetY = d.ty;
        let targetAlpha = d.alpha;

        // 1. 图表 1: 浮动效果
        if (state.currentLayout === 'bar' && targetAlpha > 0.1) {
            targetY += Math.sin(Date.now() * 0.002 + d.index) * 2;
        }

        // 2. 交互: 时光折叠 (仅 1 和 3)
        if (state.currentLayout === 'bar' || state.currentLayout === 'radial') {
            if (state.barMode === 'drop' && d.year < state.filterYear) {
                targetY += 800; // Drop
                targetAlpha = 0;
            }
        }

        // 3. 交互: 单年切片 (仅 1)
        if (state.currentLayout === 'bar' && state.barMode === 'slice') {
            if (d.year !== state.filterYear) {
                targetAlpha = 0.02;
            } else {
                targetAlpha = 1;
            }
        }

        // 4. 交互: 图例筛选
        if (state.activeTheme && d.theme !== state.activeTheme) targetAlpha *= 0.1;

        // 运动插值
        d.x += (targetX - d.x) * 0.1;
        d.y += (targetY - d.y) * 0.1;
        d.currAlpha += (targetAlpha - d.currAlpha) * 0.1;

        if (d.currAlpha < 0.01) return;

        ctx.beginPath();
        ctx.fillStyle = d.color;

        // 高亮选中
        if (state.hoveredSet === d) {
            ctx.fillStyle = "#fff";
            ctx.shadowBlur = 15; ctx.shadowColor = "#fff";
            ctx.globalAlpha = 1;
        } else {
            ctx.shadowBlur = 0;
            ctx.globalAlpha = d.currAlpha;
        }

        ctx.arc(d.x, d.y, d.r, 0, 2 * Math.PI);
        ctx.fill();
        ctx.shadowBlur = 0;
    });

    requestAnimationFrame(animate);
}

function setupInteraction(canvas) {
    d3.select(".vis-container").on("mousemove", e => {
        const [mx, my] = d3.pointer(e);
        let found = null;
        for (let i = state.sets.length - 1; i >= 0; i--) {
            const d = state.sets[i];
            // 只交互可见的
            if (d.currAlpha > 0.1 && (d.x - mx) ** 2 + (d.y - my) ** 2 < (d.r + 5) ** 2) {
                found = d; break;
            }
        }
        state.hoveredSet = found;

        const tip = d3.select("#tooltip");
        if (found) {
            tip.style("opacity", 1).style("left", e.pageX + 15 + "px").style("top", e.pageY + 15 + "px")
                .html(`
                   <strong style="color:${found.color}">● ${found.theme}</strong><br>
                   ${found.name}<br>
                   <small>${found.year} | ${found.parts} parts</small>
               `);
            document.body.style.cursor = "pointer";
        } else {
            tip.style("opacity", 0);
            document.body.style.cursor = "default";
        }
    });
}

function renderLegend(stats) {
    const el = document.getElementById("legend-container");
    el.innerHTML = '';
    stats.forEach(d => {
        const div = document.createElement("div");
        div.className = "legend-item";
        div.onclick = () => {
            state.activeTheme = (state.activeTheme === d.key) ? null : d.key;
            document.querySelectorAll(".legend-item").forEach(item => {
                if (state.activeTheme && item.innerText.indexOf(state.activeTheme) === -1) {
                    item.classList.add("dimmed");
                } else {
                    item.classList.remove("dimmed");
                }
            });
        };
        const color = stringToColor(d.key);
        div.innerHTML = `<div class="dot" style="background:${color}"></div><span>${d.key}</span><span style="margin-left:auto;color:#666">${d.count}</span>`;
        el.appendChild(div);
    });
}
init();