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
        alert("数据加载失败，请检查 public 文件夹");
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

    // 筛选数据：保证图表好看，去除极少量的噪点数据
    let rawSets = sets.filter(s => +s.year >= 1970 && +s.num_parts > 0);
    rawSets.sort((a, b) => +a.year - +b.year); // 按年份排序，这样渲染时有次序感

    // 采样：为了动画极其流畅，保持在 4000 个粒子左右
    // 如果想要更多粒子，可以增大这个数字，但要考虑电脑性能
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
        // 物理属性
        x: width / 2, y: height / 2, // 当前位置
        tx: width / 2, ty: height / 2, // 目标位置
        r: 3, // 半径
        alpha: 1
    }));

    // 统计 Top 主题
    const themeCounts = d3.rollup(state.sets, v => v.length, d => d.theme);
    state.themeStats = Array.from(themeCounts, ([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8); // Top 8

    const topThemes = state.themeStats.map(d => d.key);
    state.colorScale = d3.scaleOrdinal().domain(topThemes).range(colors).unknown("#4b5563");

    renderLegend(state.themeStats);
    document.getElementById("total-count").innerText = state.sets.length.toLocaleString();
}

// ============================================================================
// 3. 布局算法 (The "Innovation" Part)
// ============================================================================

window.switchLayout = function (mode) {
    state.currentLayout = mode;

    // UI更新
    if (window.event) {
        document.querySelectorAll(".btn").forEach(b => b.classList.remove("active"));
        window.event.currentTarget.closest(".btn").classList.add("active");
    }

    const names = { 'bar': 'Top 热门榜单', 'timeline': '历史演变长河', 'radial': '复杂性星系' };
    document.getElementById("current-view-name").innerText = names[mode];

    // 清空 SVG
    d3.select("#overlay-svg").selectAll("*").remove();

    if (mode === 'bar') layoutBarChart();
    else if (mode === 'timeline') layoutTimeline();
    else if (mode === 'radial') layoutRadial(); // 新的极坐标布局

    // 重置 Zoom (为了让用户看清全貌)
    const svg = d3.select("#overlay-svg");
    d3.zoom().transform(svg, d3.zoomIdentity);
    state.transform = d3.zoomIdentity;
};

// --- 布局 A: 粒子摩天大楼 (Stacked Bar) ---
function layoutBarChart() {
    const x = d3.scaleBand()
        .domain(state.themeStats.map(d => d.key))
        .range([margin.left, width - margin.right])
        .padding(0.4);

    const yBase = height - margin.bottom;
    const piles = {}; // 记录每个柱子当前的堆叠高度
    state.themeStats.forEach(d => piles[d.key] = 0);

    state.sets.forEach(d => {
        if (piles[d.theme] !== undefined) {
            d.tx = x(d.theme) + Math.random() * x.bandwidth(); // 柱子宽度内随机分布
            // 每一个粒子占 3px 高度，模拟积木堆叠
            d.ty = yBase - piles[d.theme] * 3;
            piles[d.theme]++;
            d.r = 2; // 变成小方块的感觉
            d.alpha = 1;
        } else {
            // 其他主题的粒子：堆在最右边或者底部变暗
            d.tx = width - margin.right / 2 + (Math.random() - 0.5) * 50;
            d.ty = height - margin.bottom - 20;
            d.alpha = 0.1;
        }
    });

    drawAxes(x, null, "LEGO Themes (Top 8)", "Set Count");
}

// --- 布局 B: 时光长河 (Timeline Stream) ---
function layoutTimeline() {
    const x = d3.scaleLinear()
        .domain(d3.extent(state.sets, d => d.year))
        .range([margin.left, width - margin.right]);

    // 按主题在Y轴分层
    const themes = state.themeStats.map(d => d.key);
    const yScale = d3.scalePoint()
        .domain(themes)
        .range([margin.top, height - margin.bottom])
        .padding(0.5);

    state.sets.forEach(d => {
        d.tx = x(d.year);

        if (themes.includes(d.theme)) {
            // 在对应主题的轨道上，加一点随机抖动 (Jitter)
            d.ty = yScale(d.theme) + (Math.random() - 0.5) * 60;
            d.r = 3;
            d.alpha = 0.8;
        } else {
            d.ty = height - margin.bottom + (Math.random() - 0.5) * 20;
            d.alpha = 0.1;
        }
    });

    drawAxes(x, yScale, "Year of Release", "Themes");
}

// --- 布局 C: 复杂性星系 (Radial Spiral) - 创新点 ---
// 极坐标：角度=年份，半径=零件数
function layoutRadial() {
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(width, height) / 2 - margin.top;

    // 角度映射年份 (1970 - 2017) -> (0 - 2PI)
    const angleScale = d3.scaleLinear()
        .domain(d3.extent(state.sets, d => d.year))
        .range([-Math.PI / 2, Math.PI * 1.5]); // 从正上方开始转一圈

    // 半径映射零件数 (Log Scale) -> (50 - maxRadius)
    // 中心留白，像黑洞
    const radiusScale = d3.scaleLog()
        .domain([1, d3.max(state.sets, d => d.parts)])
        .range([50, maxRadius]);

    state.sets.forEach(d => {
        const angle = angleScale(d.year) + (Math.random() - 0.5) * 0.1; // 加一点角度抖动防止重叠
        const r = radiusScale(d.parts);

        // 极坐标转直角坐标
        d.tx = centerX + Math.cos(angle) * r;
        d.ty = centerY + Math.sin(angle) * r;

        // 越复杂的套装，粒子越大
        d.r = Math.log(d.parts) * 0.8;
        d.alpha = 0.8;
    });

    drawRadialAxes(centerX, centerY, radiusScale, angleScale);
}

// ============================================================================
// 4. SVG 坐标轴绘制 (信 - 保证可读性)
// ============================================================================
function drawAxes(scaleX, scaleY, labelX, labelY) {
    const svg = d3.select("#overlay-svg");
    const g = svg.append("g");

    // X Axis
    const axisX = d3.axisBottom(scaleX).tickFormat(d3.format("d")).ticks(width / 80);
    if (state.currentLayout === 'bar') axisX.tickFormat(d => d); // 柱状图显示文字

    g.append("g")
        .attr("transform", `translate(0, ${height - margin.bottom + 10})`)
        .attr("class", "axis")
        .call(axisX)
        .append("text")
        .attr("x", width / 2).attr("y", 40).attr("class", "axis-title")
        .text(labelX);

    // Y Axis (Timeline only)
    if (state.currentLayout === 'timeline') {
        const axisY = d3.axisLeft(scaleY);
        g.append("g")
            .attr("transform", `translate(${margin.left - 10}, 0)`)
            .attr("class", "axis")
            .call(axisY);
    }
}

// 专门画极坐标的轴
function drawRadialAxes(cx, cy, rScale, aScale) {
    const svg = d3.select("#overlay-svg");
    const g = svg.append("g").attr("transform", `translate(${cx}, ${cy})`);

    // 画同心圆 (零件数刻度)
    const ticks = [10, 100, 1000, 5000];
    ticks.forEach(t => {
        const r = rScale(t);
        g.append("circle").attr("r", r).attr("class", "grid-circle");
        g.append("text").attr("y", -r - 5).text(t + " pcs").attr("class", "axis-text")
            .style("text-anchor", "middle").style("fill", "#666").style("font-size", "10px");
    });

    // 画放射线 (年份刻度)
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
    // 缓动系数 (0.1 = 较慢平滑)
    const ease = 0.1;

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(state.transform.x, state.transform.y);
    ctx.scale(state.transform.k, state.transform.k);

    state.sets.forEach(d => {
        // 插值动画
        d.x += (d.tx - d.x) * ease;
        d.y += (d.ty - d.y) * ease;

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
    // Zoom
    const zoom = d3.zoom().scaleExtent([0.8, 5]).on("zoom", e => {
        state.transform = e.transform;
        d3.select("#overlay-svg g").attr("transform", e.transform); // 轴同步缩放 (简单版)
    });
    d3.select(".vis-container").call(zoom);

    // Hover
    d3.select(".vis-container").on("mousemove", e => {
        const [mx, my] = d3.pointer(e);
        const t = state.transform;
        const x = (mx - t.x) / t.k;
        const y = (my - t.y) / t.k;

        let found = null;
        for (let i = state.sets.length - 1; i >= 0; i--) {
            const d = state.sets[i];
            // 简单的圆形碰撞检测
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