# LegoVerse: 乐高积木历史的生成式数据可视化

**Exploring the Evolution of LEGO (1950-2017) through Data Particles**

 

## 项目简介

**LegoVerse** 是一个基于 Web 的交互式数据可视化项目，旨在探索乐高积木套装跨越半个多世纪的演变史。

不同于传统的静态图表，本项目将每一个乐高套装具象化为一个独立的**“粒子”**。通过 **D3.js** 的数学计算与 **HTML5 Canvas** 的高性能渲染，展现了超过 4,000 个套装在时间长河中的聚散、流动与堆积。这是一次技术理性与艺术感性的融合，旨在揭示商业策略、设计复杂度与流行文化背后的数据故事。

### 核心视图与数据洞察 

本项目包含四个核心交互视图，每个视图都通过独特的物理运动效果来讲述不同的数据故事：

####  1.时光的沉淀 

横坐标：top10主题   纵坐标：套装数量

 研究核心 IP 与常青主题在乐高商业版图中的统治地位及其生命周期的兴衰更替。![image-20260108223513324](C:\Users\lxj\AppData\Roaming\Typora\typora-user-images\image-20260108223513324.png)

####  2. 流动的历史 

横坐标：发行年份   纵坐标：套装总数

研究乐高七十年历史上产能规模的爆发式增长轨迹与产品品类的多元化转型进程。

![image-20260108223519698](C:\Users\lxj\AppData\Roaming\Typora\typora-user-images\image-20260108223519698.png)

####  3. 进化的奇点

角度代表年份   半径代表套装的零件数量 

 研究乐高产品设计如何突破物理限制，从简单儿童玩具向高复杂度成人收藏级模型进化。

![image-20260108223525981](C:\Users\lxj\AppData\Roaming\Typora\typora-user-images\image-20260108223525981.png)

####  4. 市场的群山 

横坐标：零件数量   纵坐标:套装分布密度

 研究乐高如何通过“长尾效应”的产品矩阵，平衡大众入门市场与高端收藏市场的差异化需求。![image-20260108223532902](C:\Users\lxj\AppData\Roaming\Typora\typora-user-images\image-20260108223532902.png)

##  技术架构 

本项目采用 混合渲染  策略，以平衡海量数据的性能与图表的精确度：

**计算层 (Logic)**: [D3.js (v7)](https://d3js.org/)

  负责数据清洗、布局计算（Stack, Histogram, Scales）以及物理模拟的数学逻辑。

 **渲染层 (Rendering)**: [HTML5 Canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)

​    负责 4000+ 高密度粒子的实时绘制与动画，确保 60FPS 的流畅体验。

  **辅助层 (Overlay)**: SVG

​    负责绘制坐标轴、文字标签与图例，保证信息的矢量级清晰度。

  **构建工具**: [Vite](https://vitejs.dev/)

​    提供极速的开发服务器与打包构建。



##  快速开始 (Getting Started)

### 前置要求

 Node.js (v14.0.0 或更高版本)

 npm 或 yarn

### 安装步骤

#### 1.  **克隆仓库**

  bash

  git clone https://github.com/Yanguozhuang/lego-project

  cd lego-project

#### 2.  **安装依赖**

  bash

  npm install

#### 3.  **启动开发服务器**

  bash

  npm run dev

  打开浏览器访问 `http://localhost:5173` (端口可能不同) 即可查看效果。



## 项目结构 (Structure)

 LegoVerse/

├── public/

│  ├── colors.csv

│  ├── inventories.csvi

│  ├── inventory_parts.csv

│  ├── inventory_sets.csv

│  ├── part_categories.csv

│  ├── parts.csV

│  ├── sets.csv

│  ├── themes.csv

│  └── vite.svg    

├──src/

│  ├──counter.js

│  ├──javascript.svg

│  ├──main.js

│  ├── style.css

├──.gitignore

├── index.html      

├──  package-lock.json

├── package.json

└── readme.md     

 