// ============================================================================
// 全局配置
// ============================================================================
const margin = { top: 80, right: 80, bottom: 80, left: 80 };
let width = 0, height = 0;

const state = {
    sets: [],
    themes: [],
    ctx: null,
    transform: d3.zoomIdentity,
    colorScale: null,
    currentLayout: 'bar',
    themeStats: []
};

// 高级配色方案 (Vibrant)
const colors = ["#ef476f", "#ffd166", "#06d6a0", "#118ab2", "#073b4c", "#9d4edd", "#ff9f1c", "#2ec4b6"];

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

    try {
        const [sets, themes] = await Promise.all([
            d3.csv("./public/sets.csv"),
            d3.csv("./public/themes.csv")
        ]);

        processData(sets, themes);
        setupInteraction(canvas);

        // 启动动画
        requestAnimationFrame(animate);

        // 默认进入柱状图模式
        switchLayout('bar');

        d3.select("#loading").style("opacity", 0).remove();

    } catch (e) {
        console.error(e);
        alert("数据加载失败，请检查 public 文件夹中是否存在 sets.csv 和 themes.csv 文件。");
    }
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

    let rawSets = sets.filter(s => +s.year >= 1970 && +s.num_parts > 0);
    rawSets.sort((a, b) => +a.year - +b.year);

    const maxParticles = 4000;
    if (rawSets.length > maxParticles) {
        rawSets = rawSets.filter((d, i) => i % Math.ceil(rawSets.length / maxParticles) === 0);
    }

    state.sets = rawSets.map(d => ({
        id: d.set_num,
        name: d.name,
        year: +d.year,
        parts: +d.num_parts,
        theme: getRoot(d.theme_id),
        x: width / 2, y: height / 2,
        tx: width / 2, ty: height / 2,
        r: 3,
        alpha: 1
    }));

    const themeCounts = d3.rollup(state.sets, v => v.length, d => d.theme);
    state.themeStats = Array.from(themeCounts, ([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

    const topThemes = state.themeStats.map(d => d.key);
    state.colorScale = d3.scaleOrdinal().domain(topThemes).range(colors).unknown("#4b5563");

    renderLegend(state.themeStats);
    document.getElementById("total-count").innerText = state.sets.length.toLocaleString();
}

// ============================================================================
// 3. 布局算法
// ============================================================================

window.switchLayout = function (mode) {
    state.currentLayout = mode;

    if (window.event) {
        document.querySelectorAll(".btn").forEach(b => b.classList.remove("active"));
        window.event.currentTarget.closest(".btn").classList.add("active");
    }

    const names = { 'bar': 'Top 热门榜单', 'timeline': '历史演变长河', 'radial': '复杂性星系' };
    document.getElementById("current-view-name").innerText = names[mode];

    d3.select("#overlay-svg").selectAll("*").remove();

    if (mode === 'bar') layoutBarChart();
    else if (mode === 'timeline') layoutTimeline();
    else if (mode === 'radial') layoutRadial();

    state.transform = d3.zoomIdentity;
};

function layoutBarChart() {
    const x = d3.scaleBand()
        .domain(state.themeStats.map(d => d.key))
        .range([margin.left, width - margin.right])
        .padding(0.4);

    const y = d3.scaleLinear()
        .domain([0, d3.max(state.themeStats, d => d.count)])
        .range([height - margin.bottom, margin.top]); 
    
    const radiusScale = d3.scaleSqrt()
        .domain([1, d3.max(state.sets, d => d.parts)])
        .range([1.5, 12]);
        
    const themeCounts = new Map(state.themeStats.map(d => [d.key, d.count]));

    state.sets.forEach(d => {
        if (themeCounts.has(d.theme)) {
            d.r = radiusScale(d.parts);
            const barTop = y(themeCounts.get(d.theme));
            const barBottom = height - margin.bottom;
            d.tx = x(d.theme) + Math.random() * x.bandwidth();
            d.ty = barTop + Math.random() * (barBottom - barTop);   
            d.alpha = 1;
        } else {
            d.tx = width - margin.right / 2 + (Math.random() - 0.5) * 50;
            d.ty = height - margin.bottom - 20;
            d.alpha = 0.1;
        }
    });

    drawAxes(x, y, "LEGO 主题 (Top 8)", "套装数量");
}

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

    const stack = d3.stack()
        .keys(topThemes)
        .order(d3.stackOrderInsideOut)
        .offset(d3.stackOffsetNone); // 【修正】确保从 y=0 处开始堆叠

    const stackedSeries = stack(streamData);
    
    const x = d3.scaleLinear()
        .domain(d3.extent(years))
        .range([margin.left, width - margin.right]);

    const yMax = d3.max(stackedSeries, series => d3.max(series, d => d[1]));
    const y = d3.scaleLinear()
        .domain([0, yMax])
        .range([height - margin.bottom, margin.top]);
    
    // 【新增】为粒子大小创建比例尺
    const radiusScale = d3.scaleSqrt()
        .domain([1, d3.max(state.sets, d => d.parts)])
        .range([1.5, 8]); // 调整了最大半径，以适应流图
    
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
            
            // 【修正】粒子大小与零件数成正比
            d.r = radiusScale(d.parts);
            d.alpha = 0.9;
        } else {
            d.alpha = 0;
        }
    });

    drawAxes(x, y, "发行年份", "套装总数");
    drawStreamAreas(x, y, stackedSeries);
}

function layoutRadial() {
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(width, height) / 2 - margin.top;

    const angleScale = d3.scaleLinear()
        .domain(d3.extent(state.sets, d => d.year))
        .range([-Math.PI / 2, Math.PI * 1.5]);

    const radiusScale = d3.scaleLog()
        .domain([1, d3.max(state.sets, d => d.parts)])
        .range([50, maxRadius]);

    state.sets.forEach(d => {
        const angle = angleScale(d.year) + (Math.random() - 0.5) * 0.1;
        const r = radiusScale(d.parts);

        d.tx = centerX + Math.cos(angle) * r;
        d.ty = centerY + Math.sin(angle) * r;

        d.r = Math.log(d.parts) * 0.8;
        d.alpha = 0.8;
    });

    drawRadialAxes(centerX, centerY, radiusScale, angleScale);
}

// ============================================================================
// 4. SVG 坐标轴绘制
// ============================================================================
function drawAxes(scaleX, scaleY, labelX, labelY) {
    const svg = d3.select("#overlay-svg");
    const g = svg.append("g");

    const axisX = d3.axisBottom(scaleX).tickFormat(d3.format("d")).ticks(width / 80);
    if (state.currentLayout === 'bar') {
        axisX.tickFormat(d => d);
    }

    g.append("g")
        .attr("transform", `translate(0, ${height - margin.bottom})`)
        .attr("class", "axis")
        .call(axisX)
        .append("text")
        .attr("x", width / 2)
        .attr("y", 50) 
        .attr("class", "axis-title")
        .attr("text-anchor", "middle")
        .text(labelX);

    if (scaleY) {
        const axisY = d3.axisLeft(scaleY);
        
        if (state.currentLayout === 'bar' || state.currentLayout === 'timeline') {
            axisY.ticks(5, d3.format("~s"));
        }
        
        g.append("g")
            .attr("transform", `translate(${margin.left}, 0)`)
            .attr("class", "axis")
            .call(axisY)
            .append("text")
            .attr("transform", "rotate(-90)")
            .attr("y", -margin.left + 20)
            .attr("x", -(height / 2))
            .attr("dy", "1em")
            .attr("class", "axis-title")
            .style("text-anchor", "middle")
            .text(labelY);
    }
}

function drawStreamAreas(xScale, yScale, series) {
    const area = d3.area()
        .x(d => xScale(d.data.year))
        .y0(d => yScale(d[0]))
        .y1(d => yScale(d[1]))
        .curve(d3.curveBasis);

    d3.select("#overlay-svg")
        .append("g")
        .selectAll("path")
        .data(series)
        .join("path")
        .attr("d", area)
        .attr("fill", d => state.colorScale(d.key))
        .attr("opacity", 0.15);
}

function drawRadialAxes(cx, cy, rScale, aScale) {
    const svg = d3.select("#overlay-svg");
    const g = svg.append("g").attr("transform", `translate(${cx}, ${cy})`);

    const ticks = [10, 100, 1000, 5000];
    ticks.forEach(t => {
        const r = rScale(t);
        g.append("circle").attr("r", r).attr("class", "grid-circle");
        g.append("text").attr("y", -r - 5).text(t + " pcs").attr("class", "axis-text")
            .style("text-anchor", "middle").style("fill", "#666").style("font-size", "10px");
    });

    const years = [1970, 1980, 1990, 2000, 2010];
    years.forEach(y => {
        const angle = aScale(y);
        const rMax = rScale.range()[1];
        const x = Math.cos(angle) * rMax;
        const yPos = Math.sin(angle) * rMax;

        g.append("line").attr("x1", 0).attr("y1", 0).attr("x2", x).attr("y2", yPos)
            .attr("stroke", "#334155").attr("stroke-dasharray", "2,4");

        g.append("text")
            .attr("x", x * 1.1).attr("y", yPos * 1.1)
            .text(y).attr("class", "axis-text")
            .style("text-anchor", "middle").style("fill", "#94a3b8").style("font-weight", "bold");
    });
}

// ============================================================================
// 5. 动画与交互
// ============================================================================
function animate() {
    const ctx = state.ctx;
    const ease = 0.1;
    const jitterStrength = 0.5;

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(state.transform.x, state.transform.y);
    ctx.scale(state.transform.k, state.transform.k);

    state.sets.forEach(d => {
        let targetX = d.tx;
        let targetY = d.ty;

        if (state.currentLayout === 'bar' && d.alpha > 0.1) {
            targetX += (Math.random() - 0.5) * jitterStrength;
            targetY += (Math.random() - 0.5) * jitterStrength;
        }

        d.x += (targetX - d.x) * ease;
        d.y += (targetY - d.y) * ease;

        if (d.alpha < 0.01) return;

        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, 2 * Math.PI);
        ctx.fillStyle = state.colorScale(d.theme);
        ctx.globalAlpha = d.alpha;
        ctx.fill();
    });

    ctx.restore();
    requestAnimationFrame(animate);
}

function setupInteraction(canvas) {
    /*
    const zoom = d3.zoom().scaleExtent([0.8, 5]).on("zoom", e => {
        state.transform = e.transform;
        d3.select("#overlay-svg g").attr("transform", e.transform);
    });
    d3.select(".vis-container").call(zoom);
    */

    d3.select(".vis-container").on("mousemove", e => {
        const [mx, my] = d3.pointer(e);
        const t = state.transform;
        const x = (mx - t.x) / t.k;
        const y = (my - t.y) / t.k;

        let found = null;
        for (let i = state.sets.length - 1; i >= 0; i--) {
            const d = state.sets[i];
            if (d.alpha > 0.1 && (d.x - x) ** 2 + (d.y - y) ** 2 < (d.r + 4) ** 2) {
                found = d;
                break;
            }
        }

        const tip = d3.select("#tooltip");
        if (found) {
            tip.style("opacity", 1).style("left", e.pageX + 15 + "px").style("top", e.pageY + 15 + "px")
                .html(`
                   <div style="color:${state.colorScale(found.theme)}">● ${found.theme}</div>
                   <strong style="font-size:14px">${found.name}</strong><br>
                   <span style="color:#aaa">ID: ${found.id}</span><br>
                   年份: <b>${found.year}</b><br>
                   零件: <b>${found.parts}</b>
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
            state.sets.forEach(p => p.alpha = (p.theme === d.key ? 1 : 0.1));
        };
        div.innerHTML = `
            <div class="dot" style="background:${state.colorScale(d.key)}"></div>
            <span>${d.key}</span>
            <span style="margin-left:auto;color:#666">${d.count}</span>
        `;
        el.appendChild(div);
    });
}

init();
