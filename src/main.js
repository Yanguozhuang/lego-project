// src/main.js

const app = {
    // 状态管理
    state: {
        year: 2000,
        view: 'galaxy',
        loaded: false
    },

    init() {
        console.log("🚀 System Booting...");
        this.runLoader();
        this.bindEvents();
    },

    // 1. 模拟数据加载过程 (Loading Sequence)
    runLoader() {
        const progressBar = document.getElementById('load-progress');
        const statusText = document.getElementById('data-status');
        const enterBtn = document.getElementById('enter-btn');

        let progress = 0;

        // 模拟网络请求和数据处理
        const timer = setInterval(() => {
            progress += Math.random() * 5; // 随机增加进度

            // 更新进度条
            if (progressBar) progressBar.style.width = Math.min(progress, 100) + '%';

            // 更新文字提示
            if (progress > 30 && progress < 60) statusText.innerText = "> Parsing Galaxy Structures...";
            if (progress > 60 && progress < 90) statusText.innerText = "> Calculating Time Vectors...";

            if (progress >= 100) {
                clearInterval(timer);
                statusText.innerText = "> SYSTEM READY.";
                statusText.style.color = "#00ff00";

                // 显示进入按钮
                enterBtn.classList.remove('hidden');

                // 检查数据是否真的加载了
                if (typeof GALAXY_DATA !== 'undefined') {
                    console.log(`Loaded ${GALAXY_DATA.children.length} top themes.`);
                }
            }
        }, 50);
    },

    // 2. 绑定交互事件
    bindEvents() {
        // 进入系统按钮
        document.getElementById('enter-btn').addEventListener('click', () => {
            const loadingLayer = document.getElementById('loading-layer');
            const mainApp = document.getElementById('app');

            // 动画过渡
            loadingLayer.style.opacity = 0;
            setTimeout(() => {
                loadingLayer.style.display = 'none';
                mainApp.classList.remove('hidden');
                setTimeout(() => mainApp.style.opacity = 1, 50);

                // 初始化第一个图表 (这里预留接口，第二阶段写)
                // this.renderGalaxy();
            }, 800);
        });

        // 年份滑块
        const slider = document.getElementById('year-slider');
        const yearVal = document.getElementById('year-val');
        slider.addEventListener('input', (e) => {
            this.state.year = e.target.value;
            yearVal.innerText = this.state.year;
            // 触发图表更新
            // if (this.currentChart) this.currentChart.update(this.state.year);
        });
    },

    // 3. 视图切换逻辑
    switchView(viewName) {
        console.log("Switching view to:", viewName);
        this.state.view = viewName;

        // 1. 更新菜单激活状态
        document.querySelectorAll('.nav-item').forEach(el => {
            el.classList.remove('active');
            if (el.dataset.view === viewName) el.classList.add('active');
        });

        // 2. 切换视图面板
        document.querySelectorAll('.view-panel').forEach(el => {
            el.classList.remove('active');
        });
        document.getElementById(`view-${viewName}`).classList.add('active');

        // 3. 更新标题
        const titles = {
            'galaxy': 'THEME GALAXY / 扇区 A',
            'river': 'TIME RIVER / 扇区 B',
            'network': 'NETWORK MATRIX / 扇区 C'
        };
        document.getElementById('view-title').innerText = titles[viewName];
    }
};

// 启动
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});